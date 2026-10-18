import type { ForecastSummary } from "@monara/contracts";
import { demoToday } from "@/data/demo-ledger";

const money = (amountMinor: string) => ({ amountMinor, currency: "IDR" as const });
const item = (
  id: string,
  predictedOn: string,
  merchantName: string,
  amount: string,
  confidence: number,
  pattern: "monthly" | "weekly",
  reason: string,
) => ({
  id: `a0000000-0000-4000-8000-00000000000${id}`,
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
});

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
  items: [
    item(
      "1",
      "2026-10-12",
      "Ayam Geprek",
      "25000",
      0.91,
      "weekly",
      "Bought on Mondays, Wednesdays and Fridays in 8 of the last 8 weeks.",
    ),
    item(
      "2",
      "2026-10-14",
      "Ayam Geprek",
      "25000",
      0.91,
      "weekly",
      "Bought on Mondays, Wednesdays and Fridays in 8 of the last 8 weeks.",
    ),
    item(
      "3",
      "2026-10-15",
      "Spotify",
      "54990",
      0.95,
      "monthly",
      "Paid around the 15th in each of the last 4 months.",
    ),
    item(
      "4",
      "2026-10-20",
      "YouTube Premium",
      "59000",
      0.93,
      "monthly",
      "Paid around the 20th in each of the last 4 months.",
    ),
    item(
      "5",
      "2026-10-28",
      "Netflix",
      "186000",
      0.78,
      "monthly",
      "Paid around the 28th in the last 3 months.",
    ),
  ],
  totals: {
    weekRemaining: money("104990"),
    monthRemaining: money("350000"),
    monthSpentSoFar: money("1820000"),
    projectedMonthEnd: money("2170000"),
  },
  accuracy: { due: 0, realized: 0, meanAbsoluteErrorPercent: null },
};
