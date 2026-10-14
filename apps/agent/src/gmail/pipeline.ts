import type {
  GmailExtractionJob,
  GmailJob,
  GmailSyncJob,
  ResolvedGmailConnection,
} from "@monara/contracts";
import {
  type ComposioGmailReader,
  type GmailMailbox,
  type GmailMessageContent,
  GmailReadError,
} from "@monara/integrations";
import { BackendOperationError, type GmailBackend } from "./backend.ts";
import { toEmailForExtraction } from "./email-text.ts";
import { extractTransactions } from "./extract.ts";
import type { LlmClient } from "./llm.ts";

const INITIAL_IMPORT_QUERY = "newer_than:30d";
/** Re-scan a little before the last sync because Gmail can index mail late. */
const SYNC_OVERLAP_MS = 60 * 60 * 1000;
const PAGE_SIZE = 100;

export interface GmailPipelineDependencies {
  backend: GmailBackend;
  reader: ComposioGmailReader;
  llm: LlmClient;
  enqueue: (jobs: GmailJob[]) => Promise<void>;
  now?: () => Date;
}

export type GmailJobOutcome =
  | "connection_inactive"
  | "connection_lost"
  | "listed"
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

function syncQuery(since: string | null): string {
  if (since === null) return INITIAL_IMPORT_QUERY;
  const afterSeconds = Math.floor((Date.parse(since) - SYNC_OVERLAP_MS) / 1000);
  return `after:${afterSeconds}`;
}

export function createGmailPipeline(dependencies: GmailPipelineDependencies) {
  const { backend, reader, llm, enqueue } = dependencies;
  const now = dependencies.now ?? (() => new Date());

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

  /** Lists one page of mail and queues an extraction job per message. */
  async function syncConnection(job: GmailSyncJob): Promise<GmailJobOutcome> {
    const startedAt = job.startedAt ?? now().toISOString();
    const connection = await backend.resolveConnection(job.connectionId);
    const page = await read(connection, () =>
      reader.listMessages(toMailbox(connection), {
        query: syncQuery(job.since),
        pageToken: job.pageToken,
        maxResults: PAGE_SIZE,
      }),
    );

    const jobs: GmailJob[] = page.messages.map((message) => ({
      kind: "gmail.extract",
      connectionId: job.connectionId,
      gmailMessageId: message.id,
      receivedAt: message.receivedAt,
    }));
    if (page.nextPageToken) {
      jobs.push({ ...job, pageToken: page.nextPageToken, startedAt });
    }
    if (jobs.length > 0) await enqueue(jobs);
    if (!page.nextPageToken) {
      await backend.markSynced({ connectionId: job.connectionId, syncedAt: startedAt });
    }
    return "listed";
  }

  /** Reads one message, extracts it, and records the outcome exactly once. */
  async function processMessage(
    job: GmailExtractionJob,
    options: { isFinalAttempt: boolean },
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
      message ??= await read(connection, () => reader.getMessage(mailbox, job.gmailMessageId));
      const email = toEmailForExtraction(message);
      const extraction = email
        ? await extractTransactions(llm, email, connection.categoryNames)
        : null;
      const outcome = extraction && extraction.items.length > 0 ? "transactions" : "skipped";
      await backend.recordExtraction({
        processedMessageId: claim.processedMessageId,
        outcome,
        items: outcome === "transactions" && extraction ? extraction.items : [],
      });
      return outcome;
    } catch (error) {
      // A lost connection leaves the message claimed but unfinished, so it is read again after reconnecting.
      if (!options.isFinalAttempt || isNotFound(error) || error instanceof ConnectionLostError) {
        throw error;
      }
      await backend.recordExtraction({
        processedMessageId: claim.processedMessageId,
        outcome: "failed",
        items: [],
      });
      return "failed";
    }
  }

  return {
    syncConnection,
    processMessage,

    /** Queues a sync for every active connection. Runs from the cron trigger. */
    async scheduleSyncs(): Promise<number> {
      const { connections } = await backend.listActiveConnections();
      const jobs: GmailJob[] = connections.map((connection) => ({
        kind: "gmail.sync",
        connectionId: connection.connectionId,
        since: connection.lastSyncedAt,
        pageToken: null,
        startedAt: null,
      }));
      if (jobs.length > 0) await enqueue(jobs);
      return jobs.length;
    },

    /** Runs one queued job. A connection that is no longer active ends the job without retrying. */
    async runJob(job: GmailJob, options: { isFinalAttempt: boolean }): Promise<GmailJobOutcome> {
      try {
        return job.kind === "gmail.sync"
          ? await syncConnection(job)
          : await processMessage(job, options);
      } catch (error) {
        if (isNotFound(error)) return "connection_inactive";
        if (error instanceof ConnectionLostError) return "connection_lost";
        throw error;
      }
    },
  };
}
