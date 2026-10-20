import { userIdSchema } from "@monara/contracts";
import { FinanceOperationError, jakartaDate } from "@monara/core";

import { hasAgentCredential } from "@/lib/agent/credential";
import { financeErrorResponse, financeSuccessResponse } from "@/lib/finance/service";
import { dueForecastUsers, type ForecastDueCandidate } from "@/lib/forecast/due";
import { forecastService } from "@/lib/forecast/service";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Users handled per call, so one run stays inside the function's time limit. */
const BATCH = 25;
/** Users worked on at once. */
const GROUP = 5;
const HISTORY_DAYS = 130;

/**
 * The nightly forecast run. The Agent's cron calls it with the shared secret. It refreshes the
 * forecast of Users who confirmed an expense recently and have none generated since Jakarta midnight.
 */
export async function POST(request: Request) {
  if (!hasAgentCredential(request)) {
    return financeErrorResponse(new FinanceOperationError("UNAUTHENTICATED", "Not authorized."));
  }
  try {
    const cursor = new URL(request.url).searchParams.get("after");
    if (cursor !== null && !userIdSchema.safeParse(cursor).success) {
      throw new FinanceOperationError("VALIDATION_FAILED", "Invalid forecast batch cursor.");
    }
    const { service, client } = forecastService();
    const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString().slice(0, 10);
    const active = new Set<string>();
    for (let offset = 0; active.size <= BATCH; offset += 1_000) {
      let query = client
        .from("transactions")
        .select("user_id")
        .eq("transaction_type", "expense")
        .eq("review_status", "confirmed")
        .is("deleted_at", null)
        .gte("occurred_on", since)
        .order("user_id", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + 999);
      if (cursor) query = query.gt("user_id", cursor);
      const page = await query;
      if (page.error) throw new FinanceOperationError("INTERNAL", "The forecast run failed.");
      for (const row of page.data) active.add(row.user_id);
      if (page.data.length < 1_000) break;
    }
    const today = jakartaDate(new Date());
    const staleBefore = Date.parse(`${today}T00:00:00+07:00`) - 1;
    const users = [...active].sort().slice(0, BATCH);
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
    const known: ForecastDueCandidate[] = [];
    let failed = 0;
    await inGroups(users, async (userId) => {
      let current: Awaited<ReturnType<typeof service.get>>;
      try {
        current = await service.get(userId);
      } catch {
        failed += 1;
        return;
      }
      known.push({
        userId,
        generatedAt: current?.generatedAt ?? null,
        month: current?.month ?? null,
      });
    });
    // Users with no forecast first, then the oldest, so no one is starved by a fixed order.
    const due = dueForecastUsers(known, staleBefore, BATCH, today.slice(0, 7));
    let refreshed = 0;
    // One User's failure must not stop the others. The next run tries again.
    await inGroups(due, async (userId) => {
      try {
        await service.refresh(userId, "daily");
        refreshed += 1;
      } catch {
        failed += 1;
      }
    });
    return financeSuccessResponse({
      refreshed,
      failed,
      nextCursor: active.size > BATCH ? users.at(-1) : null,
    });
  } catch (error) {
    return financeErrorResponse(error);
  }
}
