import { FinanceOperationError } from "@monara/core";

import { hasAgentCredential } from "@/lib/agent/credential";
import { financeErrorResponse, financeSuccessResponse } from "@/lib/finance/service";
import { forecastService } from "@/lib/forecast/service";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Users handled per call, so one run stays inside the function's time limit. */
const BATCH = 25;
/** Users worked on at once. */
const GROUP = 5;
/** Only Users whose forecast is older than this are refreshed by the weekly run. */
const STALE_DAYS = 6;
const HISTORY_DAYS = 130;

/**
 * The weekly forecast run. The Agent's cron calls it with the shared secret. It refreshes the
 * forecast of Users who confirmed an expense recently and have none newer than a few days.
 */
export async function POST(request: Request) {
  if (!hasAgentCredential(request)) {
    return financeErrorResponse(new FinanceOperationError("UNAUTHENTICATED", "Not authorized."));
  }
  try {
    const { service, client } = forecastService();
    const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10);
    const active = new Set<string>();
    for (let offset = 0; active.size < 500; offset += 1_000) {
      const page = await client
        .from("transactions")
        .select("user_id")
        .eq("transaction_type", "expense")
        .eq("review_status", "confirmed")
        .is("deleted_at", null)
        .gte("occurred_on", since)
        .order("user_id", { ascending: true })
        .range(offset, offset + 999);
      if (page.error) throw new FinanceOperationError("INTERNAL", "The forecast run failed.");
      for (const row of page.data) active.add(row.user_id);
      if (page.data.length < 1_000) break;
    }
    const staleBefore = Date.now() - STALE_DAYS * 86_400_000;
    const users = [...active];
    // Work in small groups so a run stays fast without sending every User to the model at once.
    const inGroups = async <T>(list: T[], work: (item: T) => Promise<unknown>) => {
      const groups = Array.from({ length: Math.ceil(list.length / GROUP) }, (_, index) =>
        list.slice(index * GROUP, (index + 1) * GROUP),
      );
      await groups.reduce(
        (previous, group) =>
          previous.then(() => Promise.allSettled(group.map(work))).then(() => undefined),
        Promise.resolve(),
      );
    };
    const due: string[] = [];
    await inGroups(users, async (userId) => {
      const current = await service.get(userId);
      if (!current || Date.parse(current.generatedAt) <= staleBefore) due.push(userId);
    });
    let refreshed = 0;
    // One User's failure must not stop the others. The next run tries again.
    await inGroups(due.slice(0, BATCH), async (userId) => {
      await service.refresh(userId, "weekly");
      refreshed += 1;
    });
    return financeSuccessResponse({ refreshed });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
