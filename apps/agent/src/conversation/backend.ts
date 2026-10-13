import type { UserId } from "@monara/contracts";

/** The Channels a User can talk to the Agent through. */
type Channel = "web" | "whatsapp";

/** Who an operation runs for. Both values come from the verified Channel. */
export interface Caller {
  userId: UserId;
  channel: Channel;
}

/**
 * Calls one Monara backend operation for a User and returns its unvalidated
 * result. Injected into Agent Tools so they can be tested without a backend.
 */
export type CallOperation = (operation: string, caller: Caller, input: unknown) => Promise<unknown>;

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * The Agent never touches the database. It asks the Next.js backend, which
 * checks the shared secret and then applies the User's own ownership rules.
 */
export function createCallOperation(config: { baseUrl: string; secret: string }): CallOperation {
  const base = config.baseUrl.replace(/\/+$/, "");
  return async (operation, caller, input) => {
    const response = await fetch(`${base}/api/agent/operations/${operation}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.secret}`, "Content-Type": "application/json" },
      // The backend derives a transaction's source and its action log from the Channel.
      body: JSON.stringify({ userId: caller.userId, channel: caller.channel, input }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // The body can carry financial records, so only the status is reported.
    if (!response.ok) throw new Error(`${operation} failed with status ${response.status}.`);
    return response.json();
  };
}
