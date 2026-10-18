/** A User the weekly run might refresh, and when their forecast was made (null when they have none). */
export interface ForecastDueCandidate {
  userId: string;
  generatedAt: string | null;
}

/**
 * The Users whose forecast is missing or older than `staleBefore`, with no forecast first and then
 * the oldest, cut to `limit`. Ordering matters: a fixed order would refresh the same first Users
 * every week and starve the rest.
 */
export function dueForecastUsers(
  candidates: ForecastDueCandidate[],
  staleBefore: number,
  limit: number,
): string[] {
  return candidates
    .map((candidate) => ({
      userId: candidate.userId,
      madeAt:
        candidate.generatedAt === null
          ? Number.NEGATIVE_INFINITY
          : Date.parse(candidate.generatedAt),
    }))
    .filter((candidate) => candidate.madeAt <= staleBefore)
    .sort((a, b) =>
      a.madeAt === b.madeAt ? a.userId.localeCompare(b.userId) : a.madeAt - b.madeAt,
    )
    .slice(0, limit)
    .map((candidate) => candidate.userId);
}
