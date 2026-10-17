// Account discovery: which registry entries have emailed a mailbox recently. Reads
// message metadata only (sender and subject), never bodies, and sends nothing to a
// model, so it runs in the web backend instead of the agent's queue. The daily cron
// reaches it through the agent's discover operation.
import {
  emailInstitutions,
  findInstitutionBySender,
  type GmailConnectionId,
  type GmailDiscoveryFinding,
} from "@monara/contracts";
import {
  connectionNotActive,
  GmailIngestionError,
  type GmailIngestionRepository,
} from "./gmail-ingestion.ts";

const DISCOVERY_WINDOW = "newer_than:30d";
const PAGE_SIZE = 100;
/** Enough mail to see every institution a User has, without reading a whole inbox. */
const MAX_DISCOVERY_MESSAGES = 500;
const MAX_LAST_FOURS = 10;
/** Card or account endings as banks write them in subjects: "****1234", "xx1234", "ending 1234". */
const SUBJECT_LAST_FOUR = /(?:\*{2,}|x{2,}|ending\s+|akhiran\s+)(\d{4})\b/gi;

/** One listed message, metadata only. */
interface DiscoveryMessage {
  id: string;
  receivedAt: string | null;
  senderAddress: string | null;
  subject: string | null;
}

/** The part of the Composio Gmail reader discovery needs. */
export interface DiscoveryMailboxReader {
  listMessages(
    mailbox: { userId: string; connectedAccountId: string },
    input: { query: string; pageToken: string | null; maxResults: number },
  ): Promise<{ messages: DiscoveryMessage[]; nextPageToken: string | null }>;
  isConnectionUsable(connectedAccountId: string): Promise<boolean>;
}

export interface GmailDiscoveryDependencies {
  repository: GmailIngestionRepository;
  reader: DiscoveryMailboxReader;
}

function fromClause(senders: readonly string[]): string {
  return `from:(${senders.join(" OR ")})`;
}

function lastFoursIn(subject: string | null): string[] {
  return subject ? [...subject.matchAll(SUBJECT_LAST_FOUR)].map((match) => match[1]) : [];
}

/** Tallies listed messages by the registry entry of their sender. */
function tallyDiscovery(messages: readonly DiscoveryMessage[]): GmailDiscoveryFinding[] {
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

/** A Composio client error other than rate limiting may mean the User revoked access. */
function mayBeAuthorizationLoss(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("status" in error)) return false;
  const { status } = error;
  return typeof status === "number" && status >= 400 && status < 500 && status !== 429;
}

/**
 * Scans one active connection's mailbox and records what it found. The discovery
 * state moves to running, then completed or failed. When a read fails in a way that
 * could mean revoked access, the connection is marked as errored only if Composio
 * confirms the account is unusable, and NOT_FOUND is thrown.
 */
export async function runGmailDiscovery(
  { repository, reader }: GmailDiscoveryDependencies,
  connectionId: GmailConnectionId,
): Promise<GmailDiscoveryFinding[]> {
  const connection = await repository.resolveConnection(connectionId);
  await repository.startDiscovery(connectionId);
  const mailbox = {
    userId: connection.userId,
    connectedAccountId: connection.composioConnectedAccountId,
  };
  const list = async (senders: readonly string[], pageToken: string | null) => {
    try {
      return await reader.listMessages(mailbox, {
        query: `${DISCOVERY_WINDOW} ${fromClause(senders)}`,
        pageToken,
        maxResults: PAGE_SIZE,
      });
    } catch (error) {
      if (
        mayBeAuthorizationLoss(error) &&
        !(await reader.isConnectionUsable(mailbox.connectedAccountId))
      ) {
        await repository.markError(connectionId);
        throw connectionNotActive();
      }
      throw error;
    }
  };

  try {
    const allSenders = emailInstitutions.flatMap((entry) => entry.senderEmails);
    const messages: DiscoveryMessage[] = [];
    let pageToken: string | null = null;
    do {
      const page = await list(allSenders, pageToken);
      messages.push(...page.messages);
      pageToken = page.nextPageToken;
    } while (pageToken && messages.length < MAX_DISCOVERY_MESSAGES);

    let findings = tallyDiscovery(messages);
    // When the listing leaves out senders, ask Gmail once per entry instead.
    if (messages.some((message) => message.senderAddress === null)) {
      findings = [];
      for (const entry of emailInstitutions) {
        const page = await list(entry.senderEmails, null);
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
    await repository.recordDiscovery({ connectionId, findings });
    return findings;
  } catch (error) {
    // An inactive connection has nothing left to mark.
    if (!(error instanceof GmailIngestionError && error.code === "NOT_FOUND")) {
      await repository.failDiscovery(connectionId).catch(() => undefined);
    }
    throw error;
  }
}

/** How long discovery may stay running before a reader of its state starts it again. */
export const DISCOVERY_STALL_MS = 120_000;

/** Whether a discovery in this state should be started (again) when someone looks at it. */
export function discoveryNeedsRun(
  status: { state: "idle" | "running" | "completed" | "failed"; updatedAt: string | null },
  now: Date = new Date(),
): boolean {
  if (status.state === "idle" || status.state === "failed") return true;
  if (status.state !== "running") return false;
  if (status.updatedAt === null) return true;
  return now.getTime() - Date.parse(status.updatedAt) > DISCOVERY_STALL_MS;
}
