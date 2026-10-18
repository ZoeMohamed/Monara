/**
 * A small fixed-window rate limit for signed-in Users. The counters live in the memory of one
 * server instance, so the limit is best effort on serverless hosting: it stops a single
 * runaway client or script from running up model costs, but it is not a global quota.
 */
export interface RateLimit {
  /** Requests allowed per User in one window. */
  limit: number;
  windowMs: number;
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

interface Window {
  count: number;
  resetsAt: number;
}

const windows = new Map<string, Window>();
/** Above this many tracked Users, expired windows are dropped so memory stays bounded. */
const PRUNE_ABOVE = 2_000;

export function checkRateLimit(
  scope: string,
  userId: string,
  { limit, windowMs }: RateLimit,
  now: number = Date.now(),
): RateLimitResult {
  if (windows.size > PRUNE_ABOVE) {
    for (const [key, value] of windows) if (value.resetsAt <= now) windows.delete(key);
  }
  const key = `${scope}:${userId}`;
  const current = windows.get(key);
  if (!current || current.resetsAt <= now) {
    windows.set(key, { count: 1, resetsAt: now + windowMs });
    return { ok: true };
  }
  if (current.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetsAt - now) / 1000)),
    };
  }
  current.count += 1;
  return { ok: true };
}

/** Test hook: forget every counter. */
export function resetRateLimits(): void {
  windows.clear();
}

/** The limits for each guarded route. Chat is the tightest because every call spends model tokens. */
export const RATE_LIMITS = {
  chat: { limit: 20, windowMs: 60_000 },
  finance: { limit: 120, windowMs: 60_000 },
} as const satisfies Record<string, RateLimit>;
