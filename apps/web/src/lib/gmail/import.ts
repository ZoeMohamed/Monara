import { findInstitution, type GmailIngestReason } from "@monara/contracts";
import { GmailIngestionError } from "@monara/core";
import { requestAgentIngest } from "@/lib/gmail/agent-sync";
import { gmailConnectionService, gmailIngestionRepository } from "@/lib/gmail/service";
import { profileService } from "@/lib/profile/service";

/**
 * Starts an import of one of the User's active connections. The first import to start
 * marks the connection's sync as queued and drives its status. One that starts while
 * another is going joins it: it reads only its own senders and leaves the status alone,
 * and claiming keeps the two from parsing the same email twice.
 */
async function startImport(
  userId: string,
  connectionId: string,
  input: { reason: GmailIngestReason; institutionKeys: string[] | null },
): Promise<void> {
  const repository = gmailIngestionRepository();
  let requestedAt: string | null = null;
  try {
    requestedAt = await repository.requestSync(userId, connectionId);
  } catch (error) {
    if (!(error instanceof GmailIngestionError && error.code === "CONFLICT")) throw error;
  }
  try {
    await requestAgentIngest({ connectionId, ...input, tracksSync: requestedAt !== null });
  } catch (error) {
    if (requestedAt !== null) {
      await repository.failSync({ connectionId, error: "agent_unavailable", requestedAt });
    }
    throw error;
  }
}

async function activeConnectionIds(userId: string): Promise<string[]> {
  return (await gmailConnectionService().list(userId))
    .filter((connection) => connection.status === "active")
    .map((connection) => connection.id);
}

/**
 * Imports a newly created account's recent mail. Runs only once the User has saved
 * their name, so onboarding's bank step imports right away while transfers between
 * the User's own accounts are still recognized.
 */
export async function importAfterAccountCreated(
  userId: string,
  account: { institutionKey: string | null },
): Promise<void> {
  const key = account.institutionKey;
  if (!key || (findInstitution(key)?.senderEmails.length ?? 0) === 0) return;
  if (!(await profileService().fullName(userId))) return;
  const results = await Promise.allSettled(
    (await activeConnectionIds(userId)).map((connectionId) =>
      startImport(userId, connectionId, { reason: "account_added", institutionKeys: [key] }),
    ),
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}

/**
 * Imports mailboxes that already have accounts but were never imported, which happens
 * when the User added accounts before saving a name.
 */
export async function importAfterNameSaved(userId: string): Promise<void> {
  const repository = gmailIngestionRepository();
  const connections = (await gmailConnectionService().list(userId)).filter(
    (connection) => connection.status === "active" && connection.lastSyncedAt === null,
  );
  const results = await Promise.allSettled(
    connections.map(async (connection) => {
      const { institutionKeys } = await repository.resolveConnection(connection.id);
      if (institutionKeys.length === 0) return;
      await startImport(userId, connection.id, { reason: "onboarding", institutionKeys: null });
    }),
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}
