import { customBankIdForKey, findInstitution, type GmailIngestReason } from "@monara/contracts";
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
  let requestedAt: string;
  try {
    requestedAt = await repository.requestSync(userId, connectionId);
  } catch (error) {
    if (!(error instanceof GmailIngestionError && error.code === "CONFLICT")) throw error;
    requestedAt = await repository.joinSync(userId, connectionId);
  }
  try {
    await requestAgentIngest({ connectionId, ...input, tracksSync: true });
  } catch (error) {
    await repository.failSync({ connectionId, error: "agent_unavailable", requestedAt });
    throw error;
  }
}

/**
 * Imports a newly linked account's recent mail from the mailbox it is linked to: a new
 * account, or an account moved to another mailbox. Runs only once the User has saved
 * their name, so transfers between the User's own accounts are still recognized.
 */
export async function importAfterAccountLinked(
  userId: string,
  account: { institutionKey: string | null; gmailConnectionId: string | null; isActive: boolean },
  reason: "account_added" | "account_moved",
): Promise<void> {
  const key = account.institutionKey;
  const connectionId = account.gmailConnectionId;
  if (!account.isActive || !key || !connectionId) return;
  if (!customBankIdForKey(key) && (findInstitution(key)?.senderEmails.length ?? 0) === 0) return;
  if (!(await profileService().fullName(userId))) return;
  // The link itself was checked by the database; this also requires it to be active now.
  const active = (await gmailConnectionService().list(userId)).some(
    (connection) => connection.id === connectionId && connection.status === "active",
  );
  if (!active) return;
  if (customBankIdForKey(key)) {
    const resolved = await gmailIngestionRepository().resolveConnection(connectionId);
    if (resolved.userId !== userId || !resolved.institutionKeys.includes(key)) return;
  }
  await startImport(userId, connectionId, { reason, institutionKeys: [key] });
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

/** A sender edit imports only the bank's currently linked active accounts, once per mailbox. */
export async function importAfterCustomBankEdited(userId: string, key: string): Promise<void> {
  const connections = (await gmailConnectionService().list(userId)).filter(
    (item) => item.status === "active",
  );
  await Promise.all(
    connections.map(async (connection) => {
      const resolved = await gmailIngestionRepository().resolveConnection(connection.id);
      if (resolved.userId !== userId || !resolved.institutionKeys.includes(key)) return;
      await importAfterAccountLinked(
        userId,
        { institutionKey: key, gmailConnectionId: connection.id, isActive: true },
        "account_added",
      );
    }),
  );
}
