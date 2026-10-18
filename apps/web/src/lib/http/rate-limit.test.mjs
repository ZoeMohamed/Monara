import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  checkRateLimit,
  RATE_LIMITS,
  resetRateLimits,
  trackedRateLimitWindows,
} from "./rate-limit.ts";

const rule = { limit: 3, windowMs: 60_000 };

describe("checkRateLimit", () => {
  beforeEach(resetRateLimits);

  it("allows the limit, then refuses with the seconds left in the window", () => {
    for (let i = 0; i < 3; i++)
      assert.deepEqual(checkRateLimit("chat", "a", rule, 1_000), { ok: true });
    assert.deepEqual(checkRateLimit("chat", "a", rule, 11_000), {
      ok: false,
      retryAfterSeconds: 50,
    });
  });

  it("starts a new window once the old one ends", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("chat", "a", rule, 0);
    assert.equal(checkRateLimit("chat", "a", rule, 59_999).ok, false);
    assert.deepEqual(checkRateLimit("chat", "a", rule, 60_000), { ok: true });
  });

  it("counts each User and each scope on its own", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("chat", "a", rule, 0);
    assert.equal(checkRateLimit("chat", "a", rule, 1).ok, false);
    assert.equal(checkRateLimit("chat", "b", rule, 1).ok, true);
    assert.equal(checkRateLimit("finance", "a", rule, 1).ok, true);
  });

  it("never tells a client to retry in less than a second", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("chat", "a", rule, 0);
    assert.deepEqual(checkRateLimit("chat", "a", rule, 59_999), {
      ok: false,
      retryAfterSeconds: 1,
    });
  });

  it("keeps chat and forecast refreshes tighter than the finance routes", () => {
    assert.ok(RATE_LIMITS.chat.limit < RATE_LIMITS.finance.limit);
    assert.ok(RATE_LIMITS.forecast.limit < RATE_LIMITS.finance.limit);
  });

  it("prunes expired windows only once per interval, not on every request", () => {
    const rule = { limit: 5, windowMs: 1_000 };
    // 2,001 Users whose windows expire at 1,000 ms.
    for (let user = 0; user <= 2_000; user++) checkRateLimit("chat", `user-${user}`, rule, 0);
    assert.equal(trackedRateLimitWindows(), 2_001);
    // The first request after the windows expire scans and drops them.
    checkRateLimit("chat", "late", rule, 5_000);
    assert.equal(trackedRateLimitWindows(), 1);
    // Fill the map again with windows that expire before the next scan is allowed.
    for (let user = 0; user <= 2_000; user++) checkRateLimit("chat", `again-${user}`, rule, 5_001);
    checkRateLimit("chat", "soon", rule, 6_500);
    assert.equal(trackedRateLimitWindows(), 2_003, "no scan within 30 seconds of the last one");
    checkRateLimit("chat", "after", rule, 36_000);
    assert.equal(trackedRateLimitWindows(), 1, "scans again once the interval has passed");
  });
});
