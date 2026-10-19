import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { projectSpending } from "./projection.ts";

let counter = 0;
const item = (predictedOn, amount, realizedTransactionId = null) => ({
  id: `a0000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
  predictedOn,
  merchantName: "Spotify",
  categoryId: null,
  amount: { amountMinor: String(amount), currency: "IDR" },
  amountLow: { amountMinor: String(amount), currency: "IDR" },
  amountHigh: { amountMinor: String(amount), currency: "IDR" },
  confidence: 0.9,
  pattern: "monthly",
  reason: "Paid monthly.",
  realizedTransactionId,
});

/** A 31 day month where 10 000 rupiah is spent each day up to day 10. */
const days = Array.from({ length: 31 }, (_, index) => ({
  day: index + 1,
  cumulativeSpending: BigInt(Math.min(index + 1, 10) * 10_000),
  future: index + 1 > 10,
}));

describe("projectSpending", () => {
  it("draws confirmed spending to today and the expected path to month end", () => {
    const projection = projectSpending(
      days,
      [item("2026-10-15", 50_000), item("2026-10-20", 30_000)],
      "2026-10-10",
    );
    assert.equal(projection.todayDay, 10);
    assert.equal(projection.lastDay, 31);
    assert.equal(projection.solid.length, 10);
    assert.equal(projection.solid.at(-1).value, 100_000);
    assert.equal(projection.spentSoFar, BigInt(100_000));
    assert.equal(projection.projected, BigInt(180_000));
    assert.deepEqual(projection.dashed, [
      { day: 10, value: 100_000 },
      { day: 15, value: 100_000 },
      { day: 15, value: 150_000 },
      { day: 20, value: 150_000 },
      { day: 20, value: 180_000 },
      { day: 31, value: 180_000 },
    ]);
  });

  it("ends at confirmed spending plus what is still expected", () => {
    const projection = projectSpending(days, [item("2026-10-12", 25_000)], "2026-10-10");
    assert.equal(projection.dashed.at(-1).value, Number(projection.spentSoFar) + 25_000);
    assert.equal(projection.dashed.at(-1).day, 31);
    assert.equal(projection.maximum, 125_000);
  });

  it("leaves out payments already made and ones whose day has passed", () => {
    const projection = projectSpending(
      days,
      [
        item("2026-10-09", 40_000),
        item("2026-10-10", 20_000, "91000000-0000-4000-8000-000000000001"),
        item("2026-10-18", 10_000),
      ],
      "2026-10-10",
    );
    assert.equal(projection.projected, BigInt(110_000));
  });

  it("is a flat dashed line when nothing is expected", () => {
    const projection = projectSpending(days, [], "2026-10-10");
    assert.deepEqual(projection.dashed, [
      { day: 10, value: 100_000 },
      { day: 31, value: 100_000 },
    ]);
    assert.equal(projection.projected, projection.spentSoFar);
  });

  it("draws a payment due today at today", () => {
    const projection = projectSpending(days, [item("2026-10-10", 5_000)], "2026-10-10");
    assert.deepEqual(projection.dashed.slice(0, 3), [
      { day: 10, value: 100_000 },
      { day: 10, value: 100_000 },
      { day: 10, value: 105_000 },
    ]);
  });

  it("has nothing to draw before any day of the month has passed", () => {
    assert.equal(projectSpending([], [], "2026-10-10"), null);
    const allFuture = days.map((entry) => ({ ...entry, future: true }));
    assert.equal(projectSpending(allFuture, [], "2026-10-10"), null);
  });
});
