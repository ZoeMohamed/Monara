import {
  type GmailJob,
  type GmailSyncJob,
  gmailJobSchema,
  type MerchantCategorizeJob,
  merchantCategorizeJobSchema,
  requestGmailIngestInputSchema,
  requestGmailSyncInputSchema,
} from "@monara/contracts";
import {
  BraveSearchError,
  createBraveSearchClient,
  createComposioGmailReader,
  GmailReadError,
} from "@monara/integrations";
import type { Env } from "../env.ts";
import {
  createMerchantPipeline,
  MERCHANT_PROCESSING_BATCH_SIZE,
  MerchantBusyError,
} from "../merchant/pipeline.ts";
import { BackendOperationError, createGmailBackend } from "./backend.ts";
import { createLlmClient, isTemporaryLlmError, LlmError } from "./llm.ts";
import { createGmailPipeline } from "./pipeline.ts";

/** Matches max_retries for the Gmail queue consumer in wrangler.jsonc. */
const GMAIL_QUEUE_MAX_RETRIES = 3;
/** Matches merchant consumer max_retries in wrangler.jsonc. */
const MERCHANT_QUEUE_MAX_RETRIES = 5;
/** A busy merchant is usually searched within seconds by the job that claimed it. */
const MERCHANT_BUSY_RETRY_SECONDS = 15;
const QUEUE_SEND_BATCH_LIMIT = 100;
const MANUAL_FALLBACK_MESSAGE_LIMIT = 5;
// Three emails fit the 15-minute wall limit even with one lane and 120-second model calls.
const SAFE_PARSE_BATCH_SIZE = 3;

/** Logs ids and outcomes only; never email content, financial values, or credentials. */
function logEvent(level: "info" | "error", fields: Record<string, unknown>): void {
  // biome-ignore lint/suspicious/noConsole: Workers Logs collects console output.
  console[level === "info" ? "log" : "error"](JSON.stringify(fields));
}

/** The error type plus its HTTP status and code where it has them. Never messages or bodies. */
function failureFields(error: unknown): Record<string, unknown> {
  const reason = error instanceof Error ? error.name : "UnknownError";
  if (error instanceof GmailReadError) return { reason, status: error.status, code: error.code };
  if (error instanceof BackendOperationError) {
    return { reason, operation: error.operation, status: error.status, code: error.code };
  }
  if (error instanceof BraveSearchError) return { reason, status: error.status };
  if (error instanceof LlmError) {
    return { reason, status: error.status, code: error.failure, detail: error.message };
  }
  return { reason };
}

function retryDelaySeconds(attempts: number): number {
  return Math.min(30 * 2 ** (attempts - 1), 600);
}

/** Splitting transports work without granting it a new provider retry budget. */
function merchantJobForRequeue(
  job: MerchantCategorizeJob,
  attempts: number,
): MerchantCategorizeJob {
  const priorAttempts = Math.min(
    (job.priorAttempts ?? 0) + attempts - 1,
    MERCHANT_QUEUE_MAX_RETRIES,
  );
  return priorAttempts > 0 ? { ...job, priorAttempts } : job;
}

function requireQueue(env: Env): Queue<GmailJob> {
  if (!env.GMAIL_JOBS) throw new Error("Missing required binding: GMAIL_JOBS.");
  return env.GMAIL_JOBS;
}

function requireMerchantQueue(env: Env): Queue<MerchantCategorizeJob> {
  if (!env.MERCHANT_JOBS) throw new Error("Missing required binding: MERCHANT_JOBS.");
  return env.MERCHANT_JOBS;
}

function createBackend(env: Env) {
  return createGmailBackend({
    baseUrl: env.MONARA_BACKEND_URL ?? "",
    secret: env.MONARA_AGENT_BACKEND_SECRET ?? "",
  });
}

function createLlm(env: Env) {
  return createLlmClient({
    maxInlineRetries: 0,
    baseUrl: env.LLM_BASE_URL ?? "",
    apiKey: env.LLM_API_KEY ?? "",
    model: env.LLM_MODEL ?? "",
    // Import-specific settings do not change WhatsApp or conversation defaults.
    reasoningEffort: env.LLM_REASONING_EFFORT?.trim() ?? "medium",
    requestTimeoutMs: 120_000,
  });
}

/** A whole number from 1 to 10 from an optional setting; undefined when unset or invalid. */
function smallCount(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 10 ? parsed : undefined;
}

async function sendInBatches<T>(
  queue: Queue<T>,
  jobs: readonly T[],
  delaySeconds?: number,
): Promise<void> {
  for (let start = 0; start < jobs.length; start += QUEUE_SEND_BATCH_LIMIT) {
    const batch = jobs.slice(start, start + QUEUE_SEND_BATCH_LIMIT);
    await queue.sendBatch(
      batch.map((body) => (delaySeconds === undefined ? { body } : { body, delaySeconds })),
    );
  }
}

function isQueueDailyLimit(error: unknown): boolean {
  return error instanceof Error && /daily write operations limit/i.test(error.message);
}

/** Throws when any required secret or binding is missing, so jobs fail closed. */
function createPipeline(env: Env) {
  const queue = requireQueue(env);
  const merchantQueue = requireMerchantQueue(env);
  return createGmailPipeline({
    backend: createBackend(env),
    reader: createComposioGmailReader({
      apiUrl: env.COMPOSIO_API_URL ?? "",
      apiKey: env.COMPOSIO_API_KEY ?? "",
    }),
    llm: createLlm(env),
    enqueue: (jobs) => sendInBatches(queue, jobs),
    enqueueLater: (jobs, delaySeconds) => sendInBatches(queue, jobs, delaySeconds),
    enqueueMerchant: (jobs) => sendInBatches(merchantQueue, jobs),
    parseBatchSize: Math.min(
      smallCount(env.GMAIL_PARSE_BATCH_SIZE) ?? SAFE_PARSE_BATCH_SIZE,
      SAFE_PARSE_BATCH_SIZE,
    ),
    parseConcurrency: smallCount(env.GMAIL_PARSE_CONCURRENCY),
    observe: (metric) => logEvent("info", { event: "gmail.stage", ...metric }),
    onRetryReportError: (error) =>
      logEvent("error", { event: "gmail.retry_deadline_failed", ...failureFields(error) }),
  });
}

async function hasBackendCredential(request: Request, secret: string): Promise<boolean> {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return false;
  // Compare digests so the comparison is constant-time regardless of length.
  const encoder = new TextEncoder();
  const [expected, received] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(secret)),
    crypto.subtle.digest("SHA-256", encoder.encode(header.slice("Bearer ".length))),
  ]);
  const expectedBytes = new Uint8Array(expected);
  const receivedBytes = new Uint8Array(received);
  let difference = 0;
  for (let index = 0; index < expectedBytes.length; index += 1) {
    difference |= expectedBytes[index] ^ receivedBytes[index];
  }
  return difference === 0;
}

/** A response when the caller is not the web backend or the queue is missing; null when allowed. */
async function rejectUnlessBackend(request: Request, env: Env): Promise<Response | null> {
  const secret = env.MONARA_AGENT_BACKEND_SECRET?.trim();
  if (!secret || !env.GMAIL_JOBS) {
    return Response.json({ error: "Gmail sync is not configured." }, { status: 503 });
  }
  if (!(await hasBackendCredential(request, secret))) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  return null;
}

/**
 * Imports a connection's mail: onboarding, a newly linked account, or a new-mail
 * trigger. Only the web backend may call this, after checking the User owns the
 * connection.
 */
export async function handleGmailIngestRequest(
  request: Request,
  env: Env,
  context?: Pick<ExecutionContext, "waitUntil">,
): Promise<Response> {
  const rejected = await rejectUnlessBackend(request, env);
  if (rejected) return rejected;
  const input = requestGmailIngestInputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return Response.json({ error: "The ingest request is invalid." }, { status: 400 });
  }
  return queueSync(env, context, {
    kind: "gmail.sync",
    connectionId: input.data.connectionId,
    since: null,
    pageToken: null,
    startedAt: null,
    institutionKeys: input.data.institutionKeys,
    messageIds: input.data.messageIds,
    tracksSync: input.data.tracksSync,
  });
}

/** Manual sync, kept while a web backend that predates /gmail/ingest may still call it. */
export async function handleGmailSyncRequest(
  request: Request,
  env: Env,
  context?: Pick<ExecutionContext, "waitUntil">,
): Promise<Response> {
  const rejected = await rejectUnlessBackend(request, env);
  if (rejected) return rejected;
  const input = requestGmailSyncInputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return Response.json({ error: "connectionId and since are invalid." }, { status: 400 });
  }
  return queueSync(env, context, {
    kind: "gmail.sync",
    connectionId: input.data.connectionId,
    since: input.data.since,
    pageToken: null,
    startedAt: null,
    institutionKeys: null,
    messageIds: null,
    tracksSync: true,
  });
}

async function queueSync(
  env: Env,
  context: Pick<ExecutionContext, "waitUntil"> | undefined,
  job: GmailSyncJob,
): Promise<Response> {
  if (!env.GMAIL_JOBS)
    return Response.json({ error: "Gmail sync is not configured." }, { status: 503 });
  try {
    await env.GMAIL_JOBS.send(job);
  } catch (error) {
    if (!context || !isQueueDailyLimit(error)) throw error;
    context.waitUntil(
      createPipeline(env)
        .processRecent(job, MANUAL_FALLBACK_MESSAGE_LIMIT)
        .then((outcome) => {
          logEvent("info", {
            event: "gmail.manual_fallback_done",
            connectionId: job.connectionId,
            outcome,
          });
        })
        .catch((fallbackError: unknown) => {
          logEvent("error", {
            event: "gmail.manual_fallback_failed",
            connectionId: job.connectionId,
            ...failureFields(fallbackError),
          });
        }),
    );
  }
  return Response.json({ status: "queued" }, { status: 202 });
}

/** Daily cron: queues discovery for every active mailbox and a catch-up import for each that feeds accounts. */
export async function scheduleGmailDaily(env: Env): Promise<void> {
  const counts = await createPipeline(env).scheduleDaily();
  logEvent("info", { event: "gmail.daily_scheduled", ...counts });
}

/**
 * Queue consumer: runs a batch's jobs concurrently, since each is mostly waiting on
 * Gmail or the model. Each job acks or retries on its own; finished or invalid jobs
 * are acked and failures are retried with backoff.
 */
export async function consumeGmailJobs(batch: MessageBatch<unknown>, env: Env): Promise<void> {
  const pipeline = createPipeline(env);
  await Promise.all(
    batch.messages.map(async (message) => {
      const job = gmailJobSchema.safeParse(message.body);
      if (!job.success) {
        logEvent("error", { event: "gmail.job_invalid" });
        message.ack();
        return;
      }
      // Old queued batches can predate the activity checks. Split before any
      // provider work so they remain within the runtime's subrequest budget.
      if (job.data.kind === "gmail.parse" && job.data.emails.length > SAFE_PARSE_BATCH_SIZE) {
        const smaller: GmailJob[] = [];
        for (let index = 0; index < job.data.emails.length; index += SAFE_PARSE_BATCH_SIZE) {
          smaller.push({
            ...job.data,
            emails: job.data.emails.slice(index, index + SAFE_PARSE_BATCH_SIZE),
          });
        }
        await sendInBatches(requireQueue(env), smaller);
        message.ack();
        return;
      }
      const ids = {
        kind: job.data.kind,
        connectionId: job.data.connectionId,
        attempt: message.attempts,
      };
      try {
        const outcome = await pipeline.runJob(job.data, {
          isFinalAttempt: message.attempts > GMAIL_QUEUE_MAX_RETRIES,
          isRetry: message.attempts > 1,
        });
        logEvent("info", { event: "gmail.job_done", ...ids, outcome });
        message.ack();
      } catch (error) {
        logEvent("error", { event: "gmail.job_failed", ...ids, ...failureFields(error) });
        const delaySeconds = retryDelaySeconds(message.attempts);
        await createBackend(env)
          .reportProcessingRetry({ connectionId: job.data.connectionId, delaySeconds })
          .catch((reportError: unknown) =>
            logEvent("error", {
              event: "gmail.retry_deadline_failed",
              ...failureFields(reportError),
            }),
          );
        message.retry({ delaySeconds });
      }
    }),
  );
}

/**
 * Merchant queue consumer: categorizes imported transactions concurrently. A merchant
 * another job is searching, or a rate-limited search, is retried after a short wait.
 */
export async function consumeMerchantJobs(batch: MessageBatch<unknown>, env: Env): Promise<void> {
  // A delivery already in flight can still use the previous five-message
  // consumer setting. Requeue it before provider work so each job gets its own
  // invocation budget under the current one-message consumer configuration.
  if (batch.messages.length > 1) {
    const jobs: MerchantCategorizeJob[] = [];
    for (const message of batch.messages) {
      const job = merchantCategorizeJobSchema.safeParse(message.body);
      if (job.success) jobs.push(merchantJobForRequeue(job.data, message.attempts));
      else logEvent("error", { event: "merchant.job_invalid" });
    }
    if (jobs.length) await sendInBatches(requireMerchantQueue(env), jobs);
    for (const message of batch.messages) message.ack();
    return;
  }
  const backend = createBackend(env);
  const pipeline = createMerchantPipeline({
    backend,
    llm: createLlm(env),
    search: createBraveSearchClient({ apiKey: env.BRAVE_SEARCH_API_KEY ?? "" }),
    observe: (metric) => logEvent("info", { event: "merchant.stage", ...metric }),
  });
  await Promise.all(
    batch.messages.map(async (message) => {
      const job = merchantCategorizeJobSchema.safeParse(message.body);
      if (!job.success) {
        logEvent("error", { event: "merchant.job_invalid" });
        message.ack();
        return;
      }
      // Previously queued jobs can be larger than the invocation's network
      // budget. Preserve every row, but split before reading any transaction.
      if (
        "transactionIds" in job.data &&
        job.data.transactionIds.length > MERCHANT_PROCESSING_BATCH_SIZE
      ) {
        const smaller: MerchantCategorizeJob[] = [];
        for (
          let index = 0;
          index < job.data.transactionIds.length;
          index += MERCHANT_PROCESSING_BATCH_SIZE
        ) {
          smaller.push({
            ...merchantJobForRequeue(job.data, message.attempts),
            transactionIds: job.data.transactionIds.slice(
              index,
              index + MERCHANT_PROCESSING_BATCH_SIZE,
            ),
          });
        }
        await sendInBatches(requireMerchantQueue(env), smaller);
        message.ack();
        return;
      }
      const attempts = (job.data.priorAttempts ?? 0) + message.attempts;
      const ids = { kind: job.data.kind, attempt: attempts };
      try {
        const outcome = await pipeline.runJob(job.data, {
          isFinalAttempt: attempts > MERCHANT_QUEUE_MAX_RETRIES,
        });
        logEvent("info", { event: "merchant.job_done", ...ids, outcome });
        message.ack();
      } catch (error) {
        logEvent("error", { event: "merchant.job_failed", ...ids, ...failureFields(error) });
        const delaySeconds =
          error instanceof MerchantBusyError
            ? MERCHANT_BUSY_RETRY_SECONDS
            : Math.max(
                retryDelaySeconds(attempts),
                // A busy model said how long to wait; asking sooner only fails again.
                (isTemporaryLlmError(error) || error instanceof BraveSearchError) &&
                  error.retryAfterMs !== null
                  ? Math.min(Math.ceil(error.retryAfterMs / 1000), 900)
                  : 0,
              );
        const transactionIds =
          "transactionIds" in job.data ? job.data.transactionIds : [job.data.transactionId];
        await Promise.all(
          transactionIds.map((transactionId) =>
            backend
              .reportProcessingRetry({ transactionId, delaySeconds })
              .catch((reportError: unknown) =>
                logEvent("error", {
                  event: "merchant.retry_deadline_failed",
                  ...failureFields(reportError),
                }),
              ),
          ),
        );
        message.retry({ delaySeconds });
      }
    }),
  );
}
