import {
  emailInstitutions,
  findInstitution,
  findInstitutionBySender,
  type GmailDiscoveryFinding,
  type GmailDiscoveryJob,
  type GmailExtractionJob,
  type GmailJob,
  type GmailSyncJob,
  type MerchantCategorizeJob,
  type ResolvedGmailConnection,
} from "@monara/contracts";
import {
  type ComposioGmailReader,
  type GmailMailbox,
  type GmailMessageContent,
  type GmailMessagePage,
  type GmailMessageSummary,
  GmailReadError,
} from "@monara/integrations";
import { BackendOperationError, type GmailBackend } from "./backend.ts";
import { toEmailForExtraction } from "./email-text.ts";
import { extractTransactions } from "./extract.ts";
import type { LlmClient } from "./llm.ts";
import { isSenderVerified } from "./sender.ts";

/**
 * Every sync looks back this far, so an account added after the last sync still gets
 * its recent mail. Already processed mail is skipped before any extraction job.
 */
const IMPORT_WINDOW = "newer_than:30d";
const DISCOVERY_WINDOW = "newer_than:90d";
const PAGE_SIZE = 100;
/** Enough mail to see every institution a User has, without reading a whole inbox. */
const MAX_DISCOVERY_MESSAGES = 500;
const MAX_LAST_FOURS = 10;
/** Card or account endings as banks write them in subjects: "****1234", "xx1234", "ending 1234". */
const SUBJECT_LAST_FOUR = /(?:\*{2,}|x{2,}|ending\s+|akhiran\s+)(\d{4})\b/gi;

export interface GmailPipelineDependencies {
  backend: GmailBackend;
  reader: ComposioGmailReader;
  llm: LlmClient;
  enqueue: (jobs: GmailJob[]) => Promise<void>;
  /** Queues categorization, which runs apart from extraction. */
  enqueueMerchant: (jobs: MerchantCategorizeJob[]) => Promise<void>;
  now?: () => Date;
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

function fromClause(senders: readonly string[]): string {
  return `from:(${senders.join(" OR ")})`;
}

/** The exact sender addresses of the given registry entries. */
export function sendersFor(institutionKeys: readonly string[]): string[] {
  return institutionKeys.flatMap((key) => findInstitution(key)?.senderEmails ?? []);
}

/** Only mail from the given senders over the import window. */
export function syncQuery(senders: readonly string[]): string {
  return `${IMPORT_WINDOW} ${fromClause(senders)}`;
}

function lastFoursIn(subject: string | null): string[] {
  return subject ? [...subject.matchAll(SUBJECT_LAST_FOUR)].map((match) => match[1]) : [];
}

/** Tallies listed messages by the registry entry of their sender. */
function tally(messages: readonly GmailMessageSummary[]): GmailDiscoveryFinding[] {
  const found = new Map<string, GmailDiscoveryFinding>();
  for (const message of messages) {
    const institution = message.senderAddress
      ? findInstitutionBySender(message.senderAddress)
      : null;
    if (!institution) continue;
    const finding = found.get(institution.key) ?? {
      institutionKey: institution.key,
      emailCount: 0,
      lastFours: [],
      lastSeenAt: null,
    };
    finding.emailCount += 1;
    for (const lastFour of lastFoursIn(message.subject)) {
      if (!finding.lastFours.includes(lastFour) && finding.lastFours.length < MAX_LAST_FOURS) {
        finding.lastFours.push(lastFour);
      }
    }
    if (message.receivedAt && (!finding.lastSeenAt || message.receivedAt > finding.lastSeenAt)) {
      finding.lastSeenAt = message.receivedAt;
    }
    found.set(institution.key, finding);
  }
  return [...found.values()];
}

export function createGmailPipeline(dependencies: GmailPipelineDependencies) {
  const { backend, reader, llm, enqueue, enqueueMerchant } = dependencies;
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

  /**
   * Lists one page of mail from the senders of the User's own accounts and queues an
   * extraction job per message. With no such accounts there is nothing to read.
   */
  async function syncConnection(job: GmailSyncJob): Promise<GmailJobOutcome> {
    const startedAt = job.startedAt ?? now().toISOString();
    const connection = await backend.resolveConnection(job.connectionId);
    if (job.pageToken === null) await backend.startSync(job.connectionId);
    const senders = sendersFor(connection.institutionKeys);
    if (senders.length === 0) {
      await backend.markSynced({ connectionId: job.connectionId, syncedAt: startedAt });
      return "listed";
    }
    const page = await read(connection, () =>
      reader.listMessages(toMailbox(connection), {
        query: syncQuery(senders),
        pageToken: job.pageToken,
        maxResults: PAGE_SIZE,
      }),
    );

    // Claimed before queueing so the sync counts them as in progress until each is
    // extracted. A listing without a timestamp is claimed at the sync's start time;
    // its extraction job still reads the real time from the message.
    const pending =
      page.messages.length > 0
        ? new Set(
            (
              await backend.claimMessages({
                connectionId: job.connectionId,
                messages: page.messages.map((message) => ({
                  gmailMessageId: message.id,
                  receivedAt: message.receivedAt ?? startedAt,
                })),
              })
            ).pendingGmailMessageIds,
          )
        : new Set<string>();

    // Mail an earlier sync finished is listed again but never queued again.
    const jobs: GmailJob[] = page.messages
      .filter((message) => pending.has(message.id))
      .map((message) => ({
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

  /**
   * Reads one message, extracts it, and records the outcome exactly once. Only mail
   * whose sender belongs to one of the User's accounts is extracted; the account is
   * the sender's, and auto-confirm requires Gmail to have authenticated the sender.
   */
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
      const institution = message.fromAddress ? findInstitutionBySender(message.fromAddress) : null;
      const owned =
        institution !== null && connection.institutionKeys.includes(institution.key)
          ? institution
          : null;
      const email = owned ? toEmailForExtraction(message) : null;
      const extraction = email ? await extractTransactions(llm, email) : null;
      const outcome = extraction && extraction.items.length > 0 ? "transactions" : "skipped";
      const recorded = await backend.recordExtraction({
        processedMessageId: claim.processedMessageId,
        outcome,
        items: outcome === "transactions" && extraction ? extraction.items : [],
        institutionKey: owned?.key ?? null,
        senderVerified: isSenderVerified(message.fromAddress, message.authenticationResults),
      });
      if (!recorded.alreadyFinished && recorded.uncategorizedTransactionIds.length > 0) {
        await enqueueMerchant(
          recorded.uncategorizedTransactionIds.map((transactionId) => ({
            kind: "merchant.categorize",
            transactionId,
          })),
        );
      }
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
        institutionKey: null,
        senderVerified: false,
      });
      return "failed";
    }
  }

  /**
   * Finds which registry entries have emailed the mailbox recently, from message
   * metadata only: no bodies are read and nothing is sent to the model.
   */
  async function discover(job: GmailDiscoveryJob): Promise<GmailJobOutcome> {
    const connection = await backend.resolveConnection(job.connectionId);
    await backend.startDiscovery(job.connectionId);
    const mailbox = toMailbox(connection);
    const allSenders = emailInstitutions.flatMap((entry) => entry.senderEmails);

    const messages: GmailMessageSummary[] = [];
    let pageToken: string | null = null;
    do {
      const token: string | null = pageToken;
      const page: GmailMessagePage = await read(connection, () =>
        reader.listMessages(mailbox, {
          query: `${DISCOVERY_WINDOW} ${fromClause(allSenders)}`,
          pageToken: token,
          maxResults: PAGE_SIZE,
        }),
      );
      messages.push(...page.messages);
      pageToken = page.nextPageToken;
    } while (pageToken && messages.length < MAX_DISCOVERY_MESSAGES);

    let findings = tally(messages);
    // When the listing leaves out senders, ask Gmail once per entry instead.
    if (messages.some((message) => message.senderAddress === null)) {
      findings = [];
      for (const entry of emailInstitutions) {
        const page = await read(connection, () =>
          reader.listMessages(mailbox, {
            query: `${DISCOVERY_WINDOW} ${fromClause(entry.senderEmails)}`,
            pageToken: null,
            maxResults: PAGE_SIZE,
          }),
        );
        if (page.messages.length === 0) continue;
        const lastFours = [...new Set(page.messages.flatMap((m) => lastFoursIn(m.subject)))];
        const seen = page.messages.flatMap((m) => (m.receivedAt ? [m.receivedAt] : [])).sort();
        findings.push({
          institutionKey: entry.key,
          emailCount: page.messages.length,
          lastFours: lastFours.slice(0, MAX_LAST_FOURS),
          lastSeenAt: seen.at(-1) ?? null,
        });
      }
    }
    await backend.recordDiscovery({ connectionId: job.connectionId, findings });
    return "discovered";
  }

  return {
    syncConnection,
    processMessage,
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
        if (job.kind === "gmail.sync") return await syncConnection(job);
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
        if (job.kind === "gmail.discover" && options.isFinalAttempt) {
          await backend.reportDiscoveryFailure(job.connectionId).catch(() => undefined);
        }
        throw error;
      }
    },
  };
}
