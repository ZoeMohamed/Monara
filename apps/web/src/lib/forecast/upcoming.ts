import type { ForecastItem } from "@monara/contracts";

export interface ForecastDay {
  date: string;
  items: ForecastItem[];
  /** Whole rupiah expected on this day. */
  total: bigint;
}

/**
 * What is still ahead: predictions from today on that have not already come true, filtered by the
 * History search. Ones that already happened are real transactions now, and ones whose day passed
 * without a payment are not shown as upcoming.
 */
export function upcomingForecastItems(
  items: ForecastItem[],
  today: string,
  query = "",
): ForecastItem[] {
  const needle = query.trim().toLowerCase();
  return items.filter(
    (item) =>
      item.predictedOn >= today &&
      item.realizedTransactionId === null &&
      (needle === "" || item.merchantName.toLowerCase().includes(needle)),
  );
}

/** Soonest day first, because this list looks forward rather than back. */
export function groupForecastByDay(items: ForecastItem[]): ForecastDay[] {
  const days = new Map<string, ForecastDay>();
  for (const item of items) {
    const day = days.get(item.predictedOn) ?? {
      date: item.predictedOn,
      items: [],
      total: BigInt(0),
    };
    day.items.push(item);
    day.total += BigInt(item.amount.amountMinor);
    days.set(item.predictedOn, day);
  }
  return [...days.values()]
    .map((day) => ({
      ...day,
      items: [...day.items].sort((a, b) => a.merchantName.localeCompare(b.merchantName)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
