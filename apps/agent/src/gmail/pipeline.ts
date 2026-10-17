import {
  findInstitution,
  findInstitutionBySender,
  GMAIL_PARSE_JOB_MAX_EMAILS,
  type GmailDiscoveryJob,
  type GmailExtractionJob,
  type GmailJob,
  type GmailParseJob,
  type GmailSyncJob,
  MERCHANT_JOB_MAX_TRANSACTIONS,
  type MerchantCategorizeJob,
  type RecordGmailExtractionInput,
  type ResolvedGmailConnection,
} from "@monara/contracts";
import {
  type ComposioGmailReader,
  type GmailMailbox,
  type GmailMessageContent,
  GmailReadError,
} from "@monara/integrations";
import { BackendOperationError, type GmailBackend } from "./backend.ts";
import { toEmailForExtraction } from "./email-text.ts";
import type { LlmClient } from "./llm.ts";
import { parseEmail, shouldParse } from "./parse/index.ts";
import { isSenderVerified } from "./sender.ts";

/**
 * A first import, or one for a newly linked account, looks back this far. Already
 * processed mail is skipped before any extraction job.
 */
const IMPORT_WINDOW_DAYS = 30;
/** A catch-up overlaps the last finished import by a day, for mail Gmail listed late. */
const CATCH_UP_OVERLAP_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;

export interface GmailPipelineDependencies {
  backend: GmailBackend;
  reader: ComposioGmailReader;
  llm: LlmClient;
  enqueue: (jobs: GmailJob[]) => Promise<void>;
  /** Queues categorization, which runs apart from extraction. */
  enqueueMerchant: (jobs: MerchantCategorizeJob[]) => Promise<void>;
  /** Emails per parse job, at most GMAIL_PARSE_JOB_MAX_EMAILS. */
  parseBatchSize?: number;
  /** Emails a parse job works on at once. */
  parseConcurrency?: number;
  now?: () => Date;
}

const DEFAULT_PARSE_CONCURRENCY = 5;

/** Options for one run of a queued job. */
export interface JobRunOptions {
  /** The queue will not deliver this job again. */
  isFinalAttempt: boolean;
  /** An earlier delivery of this job may have recorded some of its emails already. */
  isRetry?: boolean;
}

export type GmailJobOutcome =
  | "connection_inactive"
  | "connection_lost"
  | "listed"
  | "discovered"
  | "already_finished"
  | "transactions"
  | "skipped"
  | "failed";

function toMailbox(connection: ResolvedGmailConnection): GmailMailbox {
  return {
    userId: connection.userId,
    connectedAccountId: connection.composioConnectedAccountId,
  };
}

function isNotFound(error: unknown): boolean {
  return error instanceof BackendOperationError && error.isNotFound;
}

/** A Composio client error other than rate limiting may mean the User revoked access. */
function mayBeAuthorizationLoss(error: unknown): boolean {
  return (
    error instanceof GmailReadError &&
    error.status !== null &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 429
  );
}

/** Signals that the connection was reported as lost, so the job ends without retrying. */
class ConnectionLostError extends Error {
  constructor() {
    super("The Gmail connection can no longer be used.");
    this.name = "ConnectionLostError";
  }
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

/** Runs fn over items with at most `limit` in flight, keeping each outcome in input order. */
async function settleWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        results[index] = { status: "fulfilled", value: await fn(items[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function fromClause(senders: readonly string[]): string {
  return `from:(${senders.join(" OR ")})`;
}

/** The exact sender addresses of the given registry entries. */
export function sendersFor(institutionKeys: readonly string[]): string[] {
  return institutionKeys.flatMap((key) => findInstitution(key)?.senderEmails ?? []);
}

/**
 * Only mail from the given senders: since a day before `since` when it is set, never
 * further back than the import window.
 */
export function syncQuery(
  senders: readonly string[],
  since: string | null = null,
  now: Date = new Date(),
): string {
  const windowStart = now.getTime() - IMPORT_WINDOW_DAYS * DAY_MS;
  const sinceMs = since === null ? Number.NaN : Date.parse(since) - CATCH_UP_OVERLAP_MS;
  const window =
    Number.isFinite(sinceMs) && sinceMs > windowStart
      ? `after:${Math.floor(sinceMs / 1000)}`
      : `newer_than:${IMPORT_WINDOW_DAYS}d`;
  return `${window} ${fromClause(senders)}`;
}

export function createGmailPipeline(dependencies: GmailPipelineDependencies) {
  const { backend, reader, llm, enqueue, enqueueMerchant } = dependencies;
  const now = dependencies.now ?? (() => new Date());
  const parseBatchSize = Math.min(
    Math.max(1, dependencies.parseBatchSize ?? GMAIL_PARSE_JOB_MAX_EMAILS),
    GMAIL_PARSE_JOB_MAX_EMAILS,
  );
  const parseConcurrency = Math.max(1, dependencies.parseConcurrency ?? DEFAULT_PARSE_CONCURRENCY);

  /** Queues categorization in batches; the merchant queue never holds up extraction. */
  async function queueCategorization(transactionIds: readonly string[]): Promise<void> {
    if (transactionIds.length === 0) return;
    await enqueueMerchant(
      chunk(transactionIds, MERCHANT_JOB_MAX_TRANSACTIONS).map((ids) => ({
        kind: "merchant.categorize",
        transactionIds: ids,
      })),
    );
  }

  /**
   * Reads and extracts one claimed message into what record-extraction takes. Only
   * mail whose sender belongs to one of the User's accounts reaches the model.
   */
  async function extractOne(
    connection: ResolvedGmailConnection,
    processedMessageId: string,
    gmailMessageId: string,
    prefetched: GmailMessageContent | null = null,
  ): Promise<RecordGmailExtractionInput> {
    const message =
      prefetched ??
      (await read(connection, () => reader.getMessage(toMailbox(connection), gmailMessageId)));
    const institution = message.fromAddress ? findInstitutionBySender(message.fromAddress) : null;
    const owned =
      institution !== null && connection.institutionKeys.includes(institution.key)
        ? institution
        : null;
    const email = owned ? toEmailForExtraction(message) : null;
    // One-time codes and the institution's known non-transaction subjects skip the model.
    const extraction =
      owned && email && shouldParse(email, owned)
        ? await parseEmail(llm, email, { holderName: connection.holderName, institution: owned })
        : null;
    const outcome = extraction && extraction.items.length > 0 ? "transactions" : "skipped";
    return {
      processedMessageId,
      outcome,
      items: outcome === "transactions" && extraction ? extraction.items : [],
      institutionKey: owned?.key ?? null,
      senderVerified: isSenderVerified(message.fromAddress, message.authenticationResults),
    };
  }

  /**
   * Runs a Composio read. When it fails in a way that could mean revoked access, asks
   * Composio about the account itself and reports the connection only if Composio
   * confirms it is unusable. A bad API key fails that check too, so it never marks Users.
   */
  async function read<T>(connection: ResolvedGmailConnection, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (!mayBeAuthorizationLoss(error)) throw error;
      if (await reader.isConnectionUsable(connection.composioConnectedAccountId)) throw error;
      await backend.reportConnectionError({
        connectionId: connection.connectionId,
        reason: "authorization_lost",
      });
      throw new ConnectionLostError();
    }
  }

  /**
   * Lists one page of mail from the senders of the User's own accounts and queues an
   * extraction job per message. With no such accounts there is nothing to read.
   */
  async function syncConnection(job: GmailSyncJob): Promise<GmailJobOutcome> {
    const startedAt = job.startedAt ?? now().toISOString();
    const connection = await backend.resolveConnection(job.connectionId);
    const tracksSync = job.tracksSync && job.messageIds === null;
    if (tracksSync && job.pageToken === null) await backend.startSync(job.connectionId);
    const finish = async () => {
      if (tracksSync)
        await backend.markSynced({ connectionId: job.connectionId, syncedAt: startedAt });
    };

    let page: {
      messages: { id: string; receivedAt: string | null }[];
      nextPageToken: string | null;
    };
    if (job.messageIds !== null) {
      // A trigger already named the messages; parsing checks each sender against the accounts.
      page = {
        messages: job.messageIds.map((id) => ({ id, receivedAt: null })),
        nextPageToken: null,
      };
    } else {
      // A run for one newly linked account reads only that account's senders.
      const keys =
        job.institutionKeys === null
          ? connection.institutionKeys
          : connection.institutionKeys.filter((key) => job.institutionKeys?.includes(key));
      const senders = sendersFor(keys);
      if (senders.length === 0) {
        await finish();
        return "listed";
      }
      page = await read(connection, () =>
        reader.listMessages(toMailbox(connection), {
          query: syncQuery(senders, job.since, new Date(startedAt)),
          pageToken: job.pageToken,
          maxResults: PAGE_SIZE,
        }),
      );
    }

    // Claimed before queueing so the sync counts them as in progress until each is
    // parsed. A listing without a timestamp is claimed at the sync's start time; the
    // parse job reads the real time from the message.
    const claimed = page.messages.map((message) => ({
      gmailMessageId: message.id,
      receivedAt: message.receivedAt ?? startedAt,
    }));
    const pending =
      claimed.length > 0
        ? new Map(
            (
              await backend.claimMessages({ connectionId: job.connectionId, messages: claimed })
            ).pending.map((entry) => [entry.gmailMessageId, entry.processedMessageId]),
          )
        : new Map<string, string>();

    // Mail an earlier sync finished is listed again but never queued again.
    const emails = claimed.flatMap((message) => {
      const processedMessageId = pending.get(message.gmailMessageId);
      return processedMessageId ? [{ processedMessageId, ...message }] : [];
    });
    const jobs: GmailJob[] = chunk(emails, parseBatchSize).map((batch) => ({
      kind: "gmail.parse",
      connectionId: job.connectionId,
      emails: batch,
    }));
    if (page.nextPageToken) {
      jobs.push({ ...job, pageToken: page.nextPageToken, startedAt });
    }
    if (jobs.length > 0) await enqueue(jobs);
    if (!page.nextPageToken) await finish();
    return "listed";
  }

  /**
   * Reads one message, extracts it, and records the outcome exactly once. Only mail
   * whose sender belongs to one of the User's accounts is extracted; the account is
   * the sender's, and auto-confirm requires Gmail to have authenticated the sender.
   */
  async function processMessage(
    job: GmailExtractionJob,
    options: JobRunOptions,
  ): Promise<GmailJobOutcome> {
    const connection = await backend.resolveConnection(job.connectionId);
    const mailbox = toMailbox(connection);

    let message: GmailMessageContent | null = null;
    let receivedAt = job.receivedAt;
    if (receivedAt === null) {
      message = await read(connection, () => reader.getMessage(mailbox, job.gmailMessageId));
      receivedAt = message.receivedAt;
    }

    const claim = await backend.claimMessage({
      connectionId: job.connectionId,
      gmailMessageId: job.gmailMessageId,
      receivedAt,
    });
    if (claim.alreadyFinished) return "already_finished";

    try {
      const result = await extractOne(
        connection,
        claim.processedMessageId,
        job.gmailMessageId,
        message,
      );
      const recorded = await backend.recordExtraction(result);
      if (!recorded.alreadyFinished) {
        await queueCategorization(recorded.uncategorizedTransactionIds);
      }
      return result.outcome;
    } catch (error) {
      // A lost connection leaves the message claimed but unfinished, so it is read again after reconnecting.
      if (!options.isFinalAttempt || isNotFound(error) || error instanceof ConnectionLostError) {
        throw error;
      }
      await backend.recordExtraction({
        processedMessageId: claim.processedMessageId,
        outcome: "failed",
        items: [],
        institutionKey: null,
        senderVerified: false,
      });
      return "failed";
    }
  }

  /**
   * Parses one job's claimed emails a few at a time and records them in one call.
   * Failed emails make the job retry; a retry first drops emails an earlier delivery
   * finished. On the final attempt they are recorded as failed instead.
   */
  async function processBatch(
    job: GmailParseJob,
    options: JobRunOptions,
  ): Promise<GmailJobOutcome> {
    const connection = await backend.resolveConnection(job.connectionId);

    let emails = job.emails;
    if (options.isRetry) {
      const claims = await Promise.all(
        emails.map((email) =>
          backend.claimMessage({
            connectionId: job.connectionId,
            gmailMessageId: email.gmailMessageId,
            receivedAt: email.receivedAt,
          }),
        ),
      );
      emails = emails.filter((_email, index) => !claims[index]?.alreadyFinished);
      if (emails.length === 0) return "already_finished";
    }

    const settled = await settleWithLimit(emails, parseConcurrency, (email) =>
      extractOne(connection, email.processedMessageId, email.gmailMessageId),
    );
    const results: RecordGmailExtractionInput[] = [];
    const failures: unknown[] = [];
    settled.forEach((outcome, index) => {
      if (outcome.status === "fulfilled") {
        results.push(outcome.value);
        return;
      }
      failures.push(outcome.reason);
      // A lost connection or an inactive one leaves the message claimed but unfinished.
      const recoverable =
        !isNotFound(outcome.reason) && !(outcome.reason instanceof ConnectionLostError);
      const email = emails[index];
      if (options.isFinalAttempt && recoverable && email) {
        results.push({
          processedMessageId: email.processedMessageId,
          outcome: "failed",
          items: [],
          institutionKey: null,
          senderVerified: false,
        });
      }
    });

    if (results.length > 0) {
      const recorded = await backend.recordExtractions({ results });
      await queueCategorization(
        recorded.results.flatMap((entry) =>
          entry.alreadyFinished ? [] : entry.uncategorizedTransactionIds,
        ),
      );
    }

    const lost = failures.find(
      (reason) => reason instanceof ConnectionLostError || isNotFound(reason),
    );
    if (lost) throw lost;
    if (failures.length > 0 && !options.isFinalAttempt) throw failures[0];
    if (results.some((result) => result.outcome === "transactions")) return "transactions";
    if (results.some((result) => result.outcome === "failed")) return "failed";
    return "skipped";
  }

  /**
   * Account discovery runs in the web backend, which reads message metadata itself.
   * The queued job only asks it to run for this connection.
   */
  async function discover(job: GmailDiscoveryJob): Promise<GmailJobOutcome> {
    await backend.discover(job.connectionId);
    return "discovered";
  }

  return {
    syncConnection,
    processMessage,
    processBatch,
    discover,

    /**
     * Queue-free safety valve for a manual demo sync. It deliberately handles only
     * the newest few messages and does not advance the durable sync cursor; the
     * normal queue will replay and deduplicate them when it is available again.
     */
    async processRecent(job: GmailSyncJob, maxMessages: number): Promise<GmailJobOutcome> {
      const connection = await backend.resolveConnection(job.connectionId);
      const senders = sendersFor(connection.institutionKeys);
      if (senders.length === 0) return "listed";
      const page = await read(connection, () =>
        reader.listMessages(toMailbox(connection), {
          query: syncQuery(senders),
          pageToken: null,
          maxResults: maxMessages,
        }),
      );
      for (const message of page.messages) {
        await processMessage(
          {
            kind: "gmail.extract",
            connectionId: job.connectionId,
            gmailMessageId: message.id,
            receivedAt: message.receivedAt,
          },
          { isFinalAttempt: true },
        );
      }
      return "listed";
    },

    /**
     * The daily cron: every active mailbox is searched again for new banks, and each
     * one that feeds accounts catches up from its last finished import. An import that
     * failed or never finished left that time where it was, so it runs again.
     */
    async scheduleDaily(): Promise<{ discoveries: number; imports: number }> {
      const { connections } = await backend.listActiveConnections();
      const discoveries: GmailJob[] = connections.map((connection) => ({
        kind: "gmail.discover",
        connectionId: connection.connectionId,
      }));
      const imports: GmailJob[] = connections
        .filter((connection) => connection.hasAccounts)
        .map((connection) => ({
          kind: "gmail.sync",
          connectionId: connection.connectionId,
          since: connection.lastSyncedAt,
          pageToken: null,
          startedAt: null,
          institutionKeys: null,
          messageIds: null,
          tracksSync: true,
        }));
      const jobs = [...discoveries, ...imports];
      if (jobs.length > 0) await enqueue(jobs);
      return { discoveries: discoveries.length, imports: imports.length };
    },

    /** Runs one queued job. A connection that is no longer active ends the job without retrying. */
    async runJob(job: GmailJob, options: JobRunOptions): Promise<GmailJobOutcome> {
      try {
        if (job.kind === "gmail.sync") return await syncConnection(job);
        if (job.kind === "gmail.parse") return await processBatch(job, options);
        if (job.kind === "gmail.discover") return await discover(job);
        return await processMessage(job, options);
      } catch (error) {
        if (isNotFound(error)) return "connection_inactive";
        if (error instanceof ConnectionLostError) return "connection_lost";
        // Best effort: the User should see the failure, but the job's own error matters more.
        if (job.kind === "gmail.sync" && options.isFinalAttempt) {
          await backend
            .reportSyncFailure({
              connectionId: job.connectionId,
              reason: error instanceof GmailReadError ? "gmail_unavailable" : "sync_failed",
            })
            .catch(() => undefined);
        }
        throw error;
      }
    },
  };
}
