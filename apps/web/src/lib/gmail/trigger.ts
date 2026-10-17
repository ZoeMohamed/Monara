import { findInstitution } from "@monara/contracts";
import { GmailIngestionError } from "@monara/core";
import { createComposioGmailTriggers } from "@monara/integrations";
import { after } from "next/server";
import { gmailConnectionService, gmailIngestionRepository } from "@/lib/gmail/service";

/**
 * Composio triggers are an external write on the User's Gmail connection, so they stay
 * off until COMPOSIO_GMAIL_TRIGGERS_ENABLED is "true" for this deployment.
 */
function triggersEnabled(): boolean {
  return process.env.COMPOSIO_GMAIL_TRIGGERS_ENABLED?.trim() === "true";
}

function triggers() {
  return createComposioGmailTriggers({
    apiUrl: process.env.COMPOSIO_API_URL ?? "",
    apiKey: process.env.COMPOSIO_API_KEY ?? "",
  });
}

/**
 * Makes a mailbox's new-mail trigger watch exactly the senders of the accounts it
 * feeds: created for its first linked account, updated as accounts change, and
 * deleted when it feeds none or is no longer active.
 */
async function syncMailboxTrigger(connectionId: string): Promise<void> {
  const repository = gmailIngestionRepository();
  const current = await repository.triggerIdOf(connectionId);
  let senders: string[] = [];
  let connectedAccountId: string | null = null;
  try {
    const connection = await repository.resolveConnection(connectionId);
    connectedAccountId = connection.composioConnectedAccountId;
    senders = connection.institutionKeys.flatMap((key) => findInstitution(key)?.senderEmails ?? []);
  } catch (error) {
    if (!(error instanceof GmailIngestionError && error.code === "NOT_FOUND")) throw error;
  }
  if (senders.length === 0 || connectedAccountId === null) {
    if (current) {
      await triggers().remove(current);
      await repository.setTriggerId(connectionId, null);
    }
    return;
  }
  const triggerId = await triggers().upsert({ connectedAccountId, senders });
  if (triggerId !== current) await repository.setTriggerId(connectionId, triggerId);
}

/** Brings every one of the User's mailbox triggers in line with their accounts. */
export async function syncUserTriggers(userId: string): Promise<void> {
  if (!triggersEnabled()) return;
  const connections = await gmailConnectionService().list(userId);
  const results = await Promise.allSettled(
    connections.map((connection) => syncMailboxTrigger(connection.id)),
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
}

/** Syncs the User's triggers once the response is sent, e.g. after a reconnect. */
export function syncTriggersAfterResponse(userId: string): void {
  if (!triggersEnabled()) return;
  after(() => syncUserTriggers(userId).catch(() => undefined));
}

/** Deletes a disconnected mailbox's trigger. Call only for the User's own connection. */
export async function removeMailboxTrigger(connectionId: string): Promise<void> {
  if (!triggersEnabled()) return;
  const repository = gmailIngestionRepository();
  const current = await repository.triggerIdOf(connectionId);
  if (!current) return;
  await triggers().remove(current);
  await repository.setTriggerId(connectionId, null);
}
