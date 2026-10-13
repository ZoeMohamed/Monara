import type { UserId } from "@monara/contracts";

/**
 * Calls one Monara backend operation for a User and returns its unvalidated
 * result. Injected into Agent Tools so they can be tested without a backend.
 */
export type CallOperation = (operation: string, userId: UserId, input: unknown) => Promise<unknown>;

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * The Agent never touches the database. It asks the Next.js backend, which
 * checks the shared secret and then applies the User's own ownership rules.
 */
export function createCallOperation(config: { baseUrl: string; secret: string }): CallOperation {
  const base = config.baseUrl.replace(/\/+$/, "");
  return async (operation, userId, input) => {
    const response = await fetch(`${base}/api/agent/operations/${operation}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId, input }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // The body can carry financial records, so only the status is reported.
    if (!response.ok) throw new Error(`${operation} failed with status ${response.status}.`);
    return response.json();
  };
}
