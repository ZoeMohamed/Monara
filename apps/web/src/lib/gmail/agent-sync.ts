import { type RequestGmailSyncInput, requestGmailSyncInputSchema } from "@monara/contracts";

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

/**
 * Asks the agent worker to queue a sync for a connection. Call it only after
 * checking that the signed-in User owns the connection and that it is active.
 */
export async function requestAgentSync(input: RequestGmailSyncInput): Promise<void> {
  const baseUrl = process.env.MONARA_AGENT_URL?.trim().replace(/\/+$/, "");
  const secret = process.env.MONARA_AGENT_BACKEND_SECRET?.trim();
  if (!baseUrl || !secret) throw new AgentSyncError(null);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/gmail/sync`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestGmailSyncInputSchema.parse(input)),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new AgentSyncError(null);
  }
  if (response.status !== 202) throw new AgentSyncError(response.status);
}
