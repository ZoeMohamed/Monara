import { discoveryNeedsRun, runGmailDiscovery } from "@monara/core";
import { createComposioGmailReader } from "@monara/integrations";
import { after } from "next/server";
import { gmailIngestionRepository } from "@/lib/gmail/service";

/**
 * Scans the mailbox for banks, cards, and wallets now. Reads message metadata only.
 * Call it only after checking that the signed-in User owns the active connection,
 * or from the authenticated agent. A failure is stored as the failed state.
 */
export async function runDiscovery(connectionId: string): Promise<void> {
  await runGmailDiscovery(
    {
      repository: gmailIngestionRepository(),
      reader: createComposioGmailReader({
        apiUrl: process.env.COMPOSIO_API_URL ?? "",
        apiKey: process.env.COMPOSIO_API_KEY ?? "",
      }),
    },
    connectionId,
  );
}

/** Starts discovery once the response is sent, so the redirect never waits for Gmail. */
export function startDiscoveryAfterResponse(connectionId: string): void {
  after(() => runDiscovery(connectionId).catch(() => undefined));
}

/**
 * Runs discovery inline when it never ran, failed, or stalled; true when it ran.
 * Call it only for a connection the signed-in User owns.
 */
export async function rerunDiscoveryIfNeeded(connectionId: string): Promise<boolean> {
  const status = await gmailIngestionRepository().discoveryStatus(connectionId);
  if (!discoveryNeedsRun(status)) return false;
  await runDiscovery(connectionId).catch(() => undefined);
  return true;
}
