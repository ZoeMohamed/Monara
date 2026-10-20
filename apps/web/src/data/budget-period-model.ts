import {
  type Budget,
  budgetUsage,
  daysBetween,
  daysInMonth,
  type Transaction,
} from "./demo-ledger.ts";

/** A cadence summary never mixes seven-day limits with monthly limits. */
export function summarizeBudgetPeriod(
  transactions: Transaction[],
  budgets: Budget[],
  cadence: Budget["cadence"],
  month: string,
  today: string,
) {
  const selected = budgets.filter((budget) => budget.cadence === cadence);
  const active = selected.flatMap((budget) => {
    const usage = budgetUsage(transactions, budget, month, today);
    return usage.periodStartsOn && usage.periodEndsOn ? [{ budget, usage }] : [];
  });
  const totalLimit = active.reduce((sum, { usage }) => sum + usage.limit, 0n);
  const totalUsed = active.reduce((sum, { usage }) => sum + usage.used, 0n);
  const remaining = active.reduce(
    (sum, { usage }) => sum + (usage.remaining > 0n ? usage.remaining : 0n),
    0n,
  );
  const overBudget = active.reduce(
    (sum, { usage }) => sum + (usage.remaining < 0n ? -usage.remaining : 0n),
    0n,
  );
  const first = active[0]?.usage;
  const firstStart = first?.periodStartsOn;
  const firstEnd = first?.periodEndsOn;
  const sharedPeriod =
    firstStart &&
    firstEnd &&
    active.every(
      ({ usage }) =>
        usage.periodStartsOn === first.periodStartsOn && usage.periodEndsOn === first.periodEndsOn,
    )
      ? { startsOn: firstStart, endsOn: firstEnd }
      : null;
  const asOf =
    month === today.slice(0, 7) ? today : `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const elapsedPercent = sharedPeriod
    ? Math.round(
        Math.max(
          0,
          Math.min(
            1,
            (daysBetween(sharedPeriod.startsOn, asOf) + 1) /
              (daysBetween(sharedPeriod.startsOn, sharedPeriod.endsOn) + 1),
          ),
        ) * 100,
      )
    : undefined;
  return {
    budgets: selected,
    totalLimit,
    totalUsed,
    remaining,
    overBudget,
    usedPercent: totalLimit > 0n ? Number((totalUsed * 100n) / totalLimit) : 0,
    elapsedPercent,
    sharedPeriod,
    activeCount: active.length,
  };
}
