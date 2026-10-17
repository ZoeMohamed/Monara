import {
  type RequestGmailSyncInput,
  requestGmailSyncInputSchema,
  startGmailDiscoveryInputSchema,
} from "@monara/contracts";

const REQUEST_TIMEOUT_MS = 10_000;

/** Raised when the agent did not accept the sync. Carries the status only. */
export class AgentSyncError extends Error {
  readonly status: number | null;

  constructor(status: number | null) {
    super("The agent did not queue the Gmail sync.");
    this.name = "AgentSyncError";
    this.status = status;
  }
}

async function postToAgent(path: string, body: unknown): Promise<void> {
  const baseUrl = process.env.MONARA_AGENT_URL?.trim().replace(/\/+$/, "");
  const secret = process.env.MONARA_AGENT_BACKEND_SECRET?.trim();
  if (!baseUrl || !secret) throw new AgentSyncError(null);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new AgentSyncError(null);
  }
  if (response.status !== 202) throw new AgentSyncError(response.status);
}

/**
 * Asks the agent worker to queue a sync for a connection. Call it only after
 * checking that the signed-in User owns the connection and that it is active.
 */
export async function requestAgentSync(input: RequestGmailSyncInput): Promise<void> {
  await postToAgent("/gmail/sync", requestGmailSyncInputSchema.parse(input));
}

/**
 * Asks the agent worker to find which banks, cards, and wallets email this mailbox.
 * Call it only after checking that the signed-in User owns the active connection.
 */
export async function requestAgentDiscovery(connectionId: string): Promise<void> {
  await postToAgent("/gmail/discover", startGmailDiscoveryInputSchema.parse({ connectionId }));
}
