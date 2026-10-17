import type { Env } from "./env.ts";

const REQUEST_TIMEOUT_MS = 30_000;

/** Logs counts and status codes only; never numbers, amounts, or credentials. */
function logEvent(level: "info" | "error", fields: Record<string, unknown>): void {
  // biome-ignore lint/suspicious/noConsole: Workers Logs collects console output.
  console[level === "info" ? "log" : "error"](JSON.stringify(fields));
}

/**
 * Cron step: asks the backend to send WhatsApp budget alerts held back by quiet
 * hours (PRD F13). The backend decides what is due; the Agent only knocks.
 */
export async function dispatchReminders(env: Env): Promise<void> {
  const baseUrl = env.MONARA_BACKEND_URL?.replace(/\/+$/, "");
  const secret = env.MONARA_AGENT_BACKEND_SECRET;
  if (!baseUrl || !secret) {
    logEvent("error", { event: "reminders.dispatch_unconfigured" });
    return;
  }
  try {
    const response = await fetch(`${baseUrl}/api/agent/reminders/dispatch`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      logEvent("error", { event: "reminders.dispatch_failed", status: response.status });
      return;
    }
    const body: unknown = await response.json();
    const settled =
      typeof body === "object" && body !== null && "settled" in body ? body.settled : null;
    logEvent("info", { event: "reminders.dispatched", settled });
  } catch (error) {
    logEvent("error", {
      event: "reminders.dispatch_failed",
      reason: error instanceof Error ? error.name : "UnknownError",
    });
  }
}
