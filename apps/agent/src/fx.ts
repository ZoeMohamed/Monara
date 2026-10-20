import type { Env } from "./env.ts";

/** FX jobs are durable in the backend; a failed wake-up leaves them for the next minute. */
export async function recoverCurrencyConversions(env: Env): Promise<void> {
  const baseUrl = env.MONARA_BACKEND_URL?.replace(/\/+$/, "");
  const secret = env.MONARA_AGENT_BACKEND_SECRET?.trim();
  if (!baseUrl || !secret) return;
  const response = await fetch(`${baseUrl}/api/agent/fx/recover`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("Currency recovery wake-up failed.");
}
