import { readApiUrl } from "./gmail-read.ts";

type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Removes one upstream resource missed by local connection records, including
 * abandoned consent attempts and triggers created during a deletion race.
 * Repeated first-page reads avoid pagination skips as resources disappear.
 */
export function createComposioUserCleanup(config: {
  apiUrl: string;
  apiKey: string;
  fetcher?: (input: string, init: RequestInit) => Promise<Response>;
}) {
  const base = readApiUrl(config.apiUrl);
  const key = config.apiKey.trim();
  if (!key) throw new Error("Gmail cleanup is not configured.");
  const fetcher = config.fetcher ?? fetch;
  async function request(path: string, method = "GET") {
    const response = await fetcher(`${base}${path}`, {
      method,
      headers: { "x-api-key": key },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok && !(method !== "GET" && response.status === 404)) {
      throw new Error("Gmail cleanup could not be completed.");
    }
    return response;
  }
  async function first(path: string, userId: string): Promise<RecordValue | null> {
    const response = await request(
      `${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams({ user_ids: userId, limit: "1" })}`,
    );
    const payload: unknown = await response.json();
    if (!record(payload) || !Array.isArray(payload.items))
      throw new Error("Gmail cleanup could not be verified.");
    const item: unknown = payload.items[0];
    if (item === undefined && !payload.next_cursor) return null;
    if (!record(item) || item.user_id !== userId || typeof item.id !== "string" || !item.id) {
      throw new Error("Gmail cleanup ownership could not be verified.");
    }
    return item;
  }
  return {
    async removeNext(userId: string): Promise<boolean> {
      const trigger = await first("/trigger_instances/active?show_disabled=true", userId);
      if (trigger) {
        await request(
          `/trigger_instances/manage/${encodeURIComponent(String(trigger.id))}`,
          "DELETE",
        );
        return false;
      }
      const account = await first("/connected_accounts", userId);
      if (!account) return true;
      const path = `/connected_accounts/${encodeURIComponent(String(account.id))}`;
      // These pending consent states have never acquired a provider grant.
      if (account.status !== "INITIATED" && account.status !== "INITIALIZING") {
        await request(`${path}/revoke`, "POST");
      }
      await request(path, "DELETE");
      return false;
    },
  };
}
