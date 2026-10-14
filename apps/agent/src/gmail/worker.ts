import {
  type GmailJob,
  gmailJobSchema,
  resolveGmailConnectionInputSchema,
} from "@monara/contracts";
import { createComposioGmailReader } from "@monara/integrations";
import type { Env } from "../env.ts";
import { createGmailBackend } from "./backend.ts";
import { createLlmClient } from "./llm.ts";
import { createGmailPipeline } from "./pipeline.ts";

/** Matches max_retries for the Gmail queue consumer in wrangler.jsonc. */
const GMAIL_QUEUE_MAX_RETRIES = 3;
const QUEUE_SEND_BATCH_LIMIT = 100;

/** Logs ids and outcomes only; never email content, financial values, or credentials. */
function logEvent(level: "info" | "error", fields: Record<string, unknown>): void {
  // biome-ignore lint/suspicious/noConsole: Workers Logs collects console output.
  console[level === "info" ? "log" : "error"](JSON.stringify(fields));
}

function retryDelaySeconds(attempts: number): number {
  return Math.min(30 * 2 ** (attempts - 1), 600);
}

function requireQueue(env: Env): Queue<GmailJob> {
  if (!env.GMAIL_JOBS) throw new Error("Missing required binding: GMAIL_JOBS.");
  return env.GMAIL_JOBS;
}

/** Throws when any required secret or binding is missing, so jobs fail closed. */
function createPipeline(env: Env) {
  const queue = requireQueue(env);
  return createGmailPipeline({
    backend: createGmailBackend({
      baseUrl: env.MONARA_BACKEND_URL ?? "",
      secret: env.MONARA_AGENT_BACKEND_SECRET ?? "",
    }),
    reader: createComposioGmailReader({
      apiUrl: env.COMPOSIO_API_URL ?? "",
      apiKey: env.COMPOSIO_API_KEY ?? "",
    }),
    llm: createLlmClient({
      baseUrl: env.LLM_BASE_URL ?? "",
      apiKey: env.LLM_API_KEY ?? "",
      model: env.LLM_MODEL ?? "",
    }),
    async enqueue(jobs) {
      for (let start = 0; start < jobs.length; start += QUEUE_SEND_BATCH_LIMIT) {
        const batch = jobs.slice(start, start + QUEUE_SEND_BATCH_LIMIT);
        await queue.sendBatch(batch.map((body) => ({ body })));
      }
    },
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
  return crypto.subtle.timingSafeEqual(expected, received);
}

/** Manual sync. Only the web backend may call this, after checking the User owns the connection. */
export async function handleGmailSyncRequest(request: Request, env: Env): Promise<Response> {
  const secret = env.MONARA_AGENT_BACKEND_SECRET?.trim();
  if (!secret || !env.GMAIL_JOBS) {
    return Response.json({ error: "Gmail sync is not configured." }, { status: 503 });
  }
  if (!(await hasBackendCredential(request, secret))) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const input = resolveGmailConnectionInputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return Response.json({ error: "connectionId must be a UUID." }, { status: 400 });
  }
  await env.GMAIL_JOBS.send({
    kind: "gmail.sync",
    connectionId: input.data.connectionId,
    since: null,
    pageToken: null,
    startedAt: null,
  });
  return Response.json({ status: "queued" }, { status: 202 });
}

/** Cron: queues one sync job per active Gmail connection. */
export async function scheduleGmailSyncs(env: Env): Promise<void> {
  const count = await createPipeline(env).scheduleSyncs();
  logEvent("info", { event: "gmail.syncs_scheduled", count });
}

/** Queue consumer: runs each job, acking finished or invalid jobs and retrying failures. */
export async function consumeGmailJobs(batch: MessageBatch<unknown>, env: Env): Promise<void> {
  const pipeline = createPipeline(env);
  for (const message of batch.messages) {
    const job = gmailJobSchema.safeParse(message.body);
    if (!job.success) {
      logEvent("error", { event: "gmail.job_invalid" });
      message.ack();
      continue;
    }
    const ids = {
      kind: job.data.kind,
      connectionId: job.data.connectionId,
      attempt: message.attempts,
    };
    try {
      const outcome = await pipeline.runJob(job.data, {
        isFinalAttempt: message.attempts > GMAIL_QUEUE_MAX_RETRIES,
      });
      logEvent("info", { event: "gmail.job_done", ...ids, outcome });
      message.ack();
    } catch (error) {
      const reason = error instanceof Error ? error.name : "UnknownError";
      logEvent("error", { event: "gmail.job_failed", ...ids, reason });
      message.retry({ delaySeconds: retryDelaySeconds(message.attempts) });
    }
  }
}
