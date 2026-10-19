import type { ForecastItem } from "@monara/contracts";

/** One day of confirmed spending, as the Reports and Home models already compute it. */
export interface SpendingDay {
  day: number;
  cumulativeSpending: bigint;
  future: boolean;
}

interface ProjectionPoint {
  day: number;
  value: number;
}

export interface Projection {
  lastDay: number;
  /** The last day with confirmed spending, normally today. */
  todayDay: number;
  /** Confirmed cumulative spending, day by day up to today. */
  solid: ProjectionPoint[];
  /** What is still expected: flat until each expected payment, then a step up. Starts at today. */
  dashed: ProjectionPoint[];
  spentSoFar: bigint;
  /** Confirmed so far plus every expected payment still ahead. */
  projected: bigint;
  /** The top of the chart. */
  maximum: number;
}

const dayOf = (date: string) => Number(date.slice(8, 10));

/**
 * The month's spending line and the expected path to month end. Only payments still ahead and not
 * already fulfilled count, so the end of the dashed line equals confirmed spending plus what is left.
 */
export function projectSpending(
  days: SpendingDay[],
  items: ForecastItem[],
  today: string,
): Projection | null {
  const lastDay = days.length;
  const past = days.filter((entry) => !entry.future);
  if (lastDay === 0 || past.length === 0) return null;
  const todayDay = past.length;
  const spentSoFar = past[past.length - 1]?.cumulativeSpending ?? BigInt(0);

  const solid = past.map((entry) => ({ day: entry.day, value: Number(entry.cumulativeSpending) }));
  const ahead = items
    .filter(
      (item) =>
        item.predictedOn >= today &&
        item.realizedTransactionId === null &&
        dayOf(item.predictedOn) <= lastDay,
    )
    .sort((a, b) => a.predictedOn.localeCompare(b.predictedOn));

  let running = spentSoFar;
  const dashed: ProjectionPoint[] = [{ day: todayDay, value: Number(running) }];
  for (const item of ahead) {
    const day = Math.max(dayOf(item.predictedOn), todayDay);
    dashed.push({ day, value: Number(running) });
    running += BigInt(item.amount.amountMinor);
    dashed.push({ day, value: Number(running) });
  }
  if (dashed[dashed.length - 1]?.day !== lastDay) {
    dashed.push({ day: lastDay, value: Number(running) });
  }

  return {
    lastDay,
    todayDay,
    solid,
    dashed,
    spentSoFar,
    projected: running,
    maximum: Math.max(Number(running), 1),
  };
}
