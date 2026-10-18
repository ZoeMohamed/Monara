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
import { createMerchantPipeline, MerchantBusyError } from "../merchant/pipeline.ts";
import { BackendOperationError, createGmailBackend } from "./backend.ts";
import { createLlmClient, isTemporaryLlmError, LlmError } from "./llm.ts";
import { createGmailPipeline } from "./pipeline.ts";

/** Matches max_retries for the Gmail queue consumer in wrangler.jsonc. */
const GMAIL_QUEUE_MAX_RETRIES = 3;
/** A busy merchant is usually searched within seconds by the job that claimed it. */
const MERCHANT_BUSY_RETRY_SECONDS = 15;
const QUEUE_SEND_BATCH_LIMIT = 100;
const MANUAL_FALLBACK_MESSAGE_LIMIT = 5;

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
    baseUrl: env.LLM_BASE_URL ?? "",
    apiKey: env.LLM_API_KEY ?? "",
    model: env.LLM_MODEL ?? "",
    reasoningEffort: env.LLM_REASONING_EFFORT,
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
    parseBatchSize: smallCount(env.GMAIL_PARSE_BATCH_SIZE),
    parseConcurrency: smallCount(env.GMAIL_PARSE_CONCURRENCY),
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
        message.retry({ delaySeconds: retryDelaySeconds(message.attempts) });
      }
    }),
  );
}

/**
 * Merchant queue consumer: categorizes imported transactions concurrently. A merchant
 * another job is searching, or a rate-limited search, is retried after a short wait.
 */
export async function consumeMerchantJobs(batch: MessageBatch<unknown>, env: Env): Promise<void> {
  const pipeline = createMerchantPipeline({
    backend: createBackend(env),
    llm: createLlm(env),
    search: createBraveSearchClient({ apiKey: env.BRAVE_SEARCH_API_KEY ?? "" }),
  });
  await Promise.all(
    batch.messages.map(async (message) => {
      const job = merchantCategorizeJobSchema.safeParse(message.body);
      if (!job.success) {
        logEvent("error", { event: "merchant.job_invalid" });
        message.ack();
        return;
      }
      const ids = { kind: job.data.kind, attempt: message.attempts };
      try {
        const outcome = await pipeline.runJob(job.data);
        logEvent("info", { event: "merchant.job_done", ...ids, outcome });
        message.ack();
      } catch (error) {
        logEvent("error", { event: "merchant.job_failed", ...ids, ...failureFields(error) });
        message.retry({
          delaySeconds:
            error instanceof MerchantBusyError
              ? MERCHANT_BUSY_RETRY_SECONDS
              : Math.max(
                  retryDelaySeconds(message.attempts),
                  // A busy model said how long to wait; asking sooner only fails again.
                  isTemporaryLlmError(error) && error.retryAfterMs !== null
                    ? Math.min(Math.ceil(error.retryAfterMs / 1000), 900)
                    : 0,
                ),
        });
      }
    }),
  );
}
