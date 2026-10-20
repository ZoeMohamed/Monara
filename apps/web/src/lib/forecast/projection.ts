import type { ForecastItem } from "@monara/contracts";
import { reportingAmountFor } from "../../data/demo-ledger.ts";

export interface SpendingDay {
  day: number;
  cumulativeSpending: bigint;
  future: boolean;
}

/** Only recorded, confirmed IDR expenses contribute to the historical pace. */
interface ProjectionRecord {
  date: string | null;
  amount: number | null;
  reportingAmount?: number | null;
  merchant: string | null;
  currency: string | null;
  kind: string | null;
  status: string;
}

interface ProjectionPoint {
  day: number;
  value: number;
}

export interface Projection {
  lastDay: number;
  todayDay: number;
  solid: ProjectionPoint[];
  dashed: ProjectionPoint[];
  spentSoFar: bigint;
  projected: bigint;
  weekRemaining: bigint;
  monthRemaining: bigint;
  historyDays: number;
  maximum: number;
}

const DAY_MS = 86_400_000;
const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
const calendarDate = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const merchantKey = (name: string | null) =>
  name
    ?.normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);

/**
 * Remove at most one supporting expense per occurrence of each predicted pattern. Matching
 * requires merchant, cadence and amount evidence, so incidental purchases remain in the pace.
 */
function coveredExpenses(
  history: ProjectionRecord[],
  items: ForecastItem[],
): Set<ProjectionRecord> {
  const covered = new Set<ProjectionRecord>();
  const occurrences = new Set<string>();
  for (const item of items) {
    for (const expense of [...history].sort(
      (a, b) =>
        Math.abs((reportingAmountFor(a) ?? 0) - Number(item.amount.amountMinor)) -
        Math.abs((reportingAmountFor(b) ?? 0) - Number(item.amount.amountMinor)),
    )) {
      if (!expense.date || expense.amount === null || covered.has(expense)) continue;
      const key = merchantKey(item.merchantName);
      if (!key || merchantKey(expense.merchant) !== key) continue;
      if (
        (reportingAmountFor(expense) ?? 0) < Number(item.amountLow.amountMinor) ||
        (reportingAmountFor(expense) ?? 0) > Number(item.amountHigh.amountMinor)
      )
        continue;
      const date = new Date(`${expense.date}T00:00:00Z`);
      const predicted = new Date(`${item.predictedOn}T00:00:00Z`);
      if (item.pattern === "weekly" && date.getUTCDay() !== predicted.getUTCDay()) continue;
      const lastDay = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
      ).getUTCDate();
      if (
        item.pattern === "monthly" &&
        Math.abs(date.getUTCDate() - Math.min(predicted.getUTCDate(), lastDay)) > 2
      )
        continue;
      const occurrence = `${key}:${item.pattern}:${item.pattern === "monthly" ? expense.date.slice(0, 7) : expense.date}`;
      if (occurrences.has(occurrence)) continue;
      occurrences.add(occurrence);
      covered.add(expense);
    }
  }
  return covered;
}

/** Confirmed spending plus a residual daily pace and each specific upcoming payment once. */
export function projectSpending(
  days: SpendingDay[],
  items: ForecastItem[],
  today: string,
  records: ProjectionRecord[] = [],
): Projection | null {
  const past = days.filter((entry) => !entry.future);
  if (days.length === 0 || past.length === 0) return null;
  const todayDay = Number(today.slice(8, 10));
  const now = dayNumber(today);
  const expenses = records.filter(
    (record) =>
      record.status === "confirmed" &&
      record.kind === "expense" &&
      reportingAmountFor(record) !== null &&
      record.date !== null &&
      record.date <= today &&
      Number.isSafeInteger(record.amount) &&
      (reportingAmountFor(record) ?? 0) > 0,
  );
  const earliest = expenses.reduce(
    (first, expense) => Math.min(first, dayNumber(expense.date ?? today)),
    now,
  );
  const historyDays = Math.min(30, now - earliest);
  const history = expenses.filter((expense) => {
    const day = dayNumber(expense.date ?? today);
    return historyDays === 0 ? day === now : day >= now - historyDays && day < now;
  });
  const currentItems = items.filter((item) => item.predictedOn.slice(0, 7) === today.slice(0, 7));
  const covered = coveredExpenses(history, currentItems);
  const ordinary = history.reduce(
    (sum, expense) => sum + (covered.has(expense) ? 0n : BigInt(reportingAmountFor(expense) ?? 0)),
    0n,
  );
  const divisor = BigInt(Math.max(historyDays, 1));
  const ahead = currentItems.filter(
    (item) => item.predictedOn >= today && item.realizedTransactionId === null,
  );
  const spentSoFar = past.at(-1)?.cumulativeSpending ?? 0n;
  const solid = past.map((entry) => ({ day: entry.day, value: Number(entry.cumulativeSpending) }));
  let running = spentSoFar;
  const dashed: ProjectionPoint[] = [{ day: todayDay, value: Number(running) }];
  const sunday = now + (7 - (((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) + 1));
  let weekRemaining = 0n;
  let previousPace = 0n;
  for (let day = todayDay; day <= days.length; day++) {
    // Today's actual spending is already counted. Begin the ordinary pace tomorrow.
    const pace = (ordinary * BigInt(day - todayDay)) / divisor;
    let expected = pace - previousPace;
    previousPace = pace;
    const date = calendarDate(now + day - todayDay);
    for (const item of ahead)
      if (item.predictedOn === date) expected += BigInt(item.amount.amountMinor);
    running += expected;
    if (now + day - todayDay <= sunday) weekRemaining += expected;
    dashed.push({ day, value: Number(running) });
  }
  return {
    lastDay: days.length,
    todayDay,
    solid,
    dashed,
    spentSoFar,
    projected: running,
    weekRemaining,
    monthRemaining: running - spentSoFar,
    historyDays: expenses.length === 0 ? 0 : Math.max(historyDays, 1),
    maximum: Math.max(Number(running), 1),
  };
}
