import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { checkRateLimit, RATE_LIMITS, resetRateLimits } from "./rate-limit.ts";

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

  it("keeps chat tighter than the finance routes", () => {
    assert.ok(RATE_LIMITS.chat.limit < RATE_LIMITS.finance.limit);
  });
});
