/** A missing forecast or one generated before Jakarta midnight needs a catch-up run. */
export function forecastNeedsRefresh(
  forecast: { generatedAt: string; month: string } | null,
  today: string,
): boolean {
  return (
    !forecast ||
    forecast.month < today.slice(0, 7) ||
    Date.parse(forecast.generatedAt) < Date.parse(`${today}T00:00:00+07:00`)
  );
}

/** A User the nightly run might refresh, and the forecast they have (null when none). */
export interface ForecastDueCandidate {
  userId: string;
  generatedAt: string | null;
  /** The calendar month the forecast covers, as YYYY-MM. */
  month: string | null;
}

/**
 * The Users whose forecast is missing, older than `staleBefore`, or for a month that is over,
 * with no forecast first and then the oldest, cut to `limit`. A forecast for a past month is due
 * however new it is, because every date in it has already gone by. Ordering matters: a fixed
 * order would refresh the same first Users every night and starve the rest.
 */
export function dueForecastUsers(
  candidates: ForecastDueCandidate[],
  staleBefore: number,
  limit: number,
  currentMonth: string,
): string[] {
  return candidates
    .map((candidate) => ({
      userId: candidate.userId,
      madeAt:
        candidate.generatedAt === null
          ? Number.NEGATIVE_INFINITY
          : Date.parse(candidate.generatedAt),
      overMonth: candidate.month !== null && candidate.month < currentMonth,
    }))
    .filter((candidate) => candidate.madeAt <= staleBefore || candidate.overMonth)
    .sort((a, b) =>
      a.madeAt === b.madeAt ? a.userId.localeCompare(b.userId) : a.madeAt - b.madeAt,
    )
    .slice(0, limit)
    .map((candidate) => candidate.userId);
}
