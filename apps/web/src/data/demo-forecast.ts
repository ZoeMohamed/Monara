import type { ForecastItem, ForecastSummary } from "@monara/contracts";
import { demoToday } from "@/data/demo-ledger";

const DAY = 86_400_000;
const money = (amountMinor: string) => ({ amountMinor, currency: "IDR" as const });
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
/** Monday is 1 and Sunday is 7. */
const weekday = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
const endOfMonth = (date: string) => {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, month ?? 1, 0)).toISOString().slice(0, 10);
};

let counter = 0;
function item(
  predictedOn: string,
  merchantName: string,
  amount: string,
  confidence: number,
  pattern: "monthly" | "weekly",
  reason: string,
): ForecastItem {
  counter += 1;
  return {
    id: `a0000000-0000-4000-8000-${String(counter).padStart(12, "0")}`,
    predictedOn,
    merchantName,
    categoryId: null,
    amount: money(amount),
    amountLow: money(amount),
    amountHigh: money(amount),
    confidence,
    pattern,
    reason,
    realizedTransactionId: null,
  };
}

const habit = "Bought on Mondays, Wednesdays and Fridays in 8 of the last 8 weeks.";
const items: ForecastItem[] = [
  item(
    "2026-10-15",
    "Spotify",
    "54990",
    0.95,
    "monthly",
    "Paid around the 15th in each of the last 4 months.",
  ),
  item(
    "2026-10-20",
    "YouTube Premium",
    "59000",
    0.93,
    "monthly",
    "Paid around the 20th in each of the last 4 months.",
  ),
  item(
    "2026-10-28",
    "Netflix",
    "186000",
    0.78,
    "monthly",
    "Paid around the 28th in the last 3 months.",
  ),
  item(
    "2026-11-15",
    "Spotify",
    "54990",
    0.95,
    "monthly",
    "Paid around the 15th in each of the last 4 months.",
  ),
];
// The habit: every Monday, Wednesday and Friday from the day after the demo date to the end of the month.
for (let offset = 1; addDays(demoToday, offset) <= endOfMonth(demoToday); offset++) {
  const date = addDays(demoToday, offset);
  if ([1, 3, 5].includes(weekday(date)))
    items.push(item(date, "Ayam Geprek", "25000", 0.91, "weekly", habit));
}
const upcoming = items
  .filter((entry) => entry.predictedOn >= demoToday && entry.predictedOn <= endOfMonth(demoToday))
  .sort(
    (a, b) =>
      a.predictedOn.localeCompare(b.predictedOn) || a.merchantName.localeCompare(b.merchantName),
  );

const sum = (list: ForecastItem[]) =>
  list.reduce((total, entry) => total + Number(entry.amount.amountMinor), 0);
const weekEnd = addDays(demoToday, 7 - weekday(demoToday));
const spentSoFar = 1_820_000;

/** A synthetic forecast for the public demo, which has no signed-in User to forecast for. */
export const demoForecast: ForecastSummary = {
  runId: "a1000000-0000-4000-8000-000000000001",
  generatedAt: `${demoToday}T03:00:00.000Z`,
  source: "manual",
  month: demoToday.slice(0, 7),
  threshold: 0.7,
  usedModel: true,
  candidateCount: 6,
  discardedCount: 1,
  items: upcoming,
  // Worked out from the items, so the totals always add up to what the list shows.
  totals: {
    weekRemaining: money(String(sum(upcoming.filter((entry) => entry.predictedOn <= weekEnd)))),
    monthRemaining: money(String(sum(upcoming))),
    monthSpentSoFar: money(String(spentSoFar)),
    projectedMonthEnd: money(String(spentSoFar + sum(upcoming))),
  },
  accuracy: { due: 0, realized: 0, meanAbsoluteErrorPercent: null },
};
