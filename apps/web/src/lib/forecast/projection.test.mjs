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

const expense = (date, amount, overrides = {}) => ({
  date,
  amount,
  merchant: "Cafe",
  currency: "IDR",
  kind: "expense",
  status: "confirmed",
  ...overrides,
});

describe("projectSpending", () => {
  it("draws confirmed spending and adds only upcoming unrealized items", () => {
    const projection = projectSpending(
      days,
      [
        item("2026-10-09", 40_000),
        item("2026-10-10", 20_000, "paid"),
        item("2026-10-15", 50_000),
        item("2026-10-20", 30_000),
        item("2026-11-01", 90_000),
      ],
      "2026-10-10",
    );
    assert.equal(projection.solid.at(-1).value, 100_000);
    assert.equal(projection.projected, 180_000n);
    assert.equal(
      projection.dashed.at(-1).value,
      Number(projection.spentSoFar + projection.monthRemaining),
    );
    assert.equal(projection.dashed.at(-1).day, 31);
  });

  it("uses 30 complete calendar days, including zero-spend days, without today's expense", () => {
    const projection = projectSpending(days, [], "2026-10-10", [
      expense("2026-08-01", 99_000),
      expense("2026-09-10", 30_000),
      expense("2026-10-10", 900_000),
    ]);
    assert.equal(projection.historyDays, 30);
    assert.equal(projection.monthRemaining, 21_000n);
    assert.equal(projection.weekRemaining, 1_000n); // Saturday to Sunday, tomorrow's pace only.
    assert.equal(projection.projected, 121_000n);
  });

  it("shows a provisional estimate with only today's spending", () => {
    const projection = projectSpending(days, [], "2026-10-10", [expense("2026-10-10", 100)]);
    assert.equal(projection.historyDays, 1);
    assert.equal(projection.monthRemaining, 2_100n);
  });

  it("uses the available span for short history and retains zero-spend days", () => {
    const projection = projectSpending(days, [], "2026-10-10", [expense("2026-10-07", 300)]);
    assert.equal(projection.historyDays, 3);
    assert.equal(projection.monthRemaining, 2_100n);
  });

  it("draws an empty chart and still shows specific predictions without history", () => {
    const empty = projectSpending(days, [], "2026-10-10");
    assert.equal(empty.historyDays, 0);
    assert.equal(empty.projected, empty.spentSoFar);
    const predicted = projectSpending(days, [item("2026-10-20", 50)], "2026-10-10");
    assert.equal(predicted.monthRemaining, 50n);
  });

  it("never uses pending, income, exclusion, future or non-IDR expenses for the pace", () => {
    const invalid = [
      expense("2026-10-09", 500, { status: "pending" }),
      expense("2026-10-09", 500, { kind: "income" }),
      expense("2026-10-09", 500, { kind: "exclusion" }),
      expense("2026-10-09", 500, { currency: "USD" }),
      expense("2026-10-11", 500),
      expense(null, 500),
      expense("2026-10-09", null),
    ];
    assert.equal(projectSpending(days, [], "2026-10-10", invalid).monthRemaining, 0n);
  });

  it("replaces a matching monthly bill but retains incidental same-merchant purchases", () => {
    const projection = projectSpending(days, [item("2026-10-20", 30_000)], "2026-10-10", [
      expense("2026-09-10", 3_000),
      expense("2026-09-20", 30_000, { merchant: "Spotify" }),
      expense("2026-09-21", 5_000, { merchant: "Spotify" }),
      expense("2026-09-15", 30_000, { merchant: "Spotify" }),
    ]);
    assert.equal(projection.monthRemaining, 30_000n + (38_000n * 21n) / 30n);
  });

  it("replaces only one matching habit payment on each matching weekday", () => {
    const habit = { ...item("2026-10-12", 100), pattern: "weekly", merchantName: "Cafe" };
    const projection = projectSpending(
      days,
      [habit, { ...habit, predictedOn: "2026-10-19" }],
      "2026-10-10",
      [
        expense("2026-09-10", 300),
        expense("2026-10-05", 100), // Monday: replaced.
        expense("2026-10-05", 100), // An additional same-day purchase stays.
        expense("2026-10-06", 100), // Tuesday: stays.
      ],
    );
    assert.equal(projection.monthRemaining, 200n + (500n * 21n) / 30n);
  });

  it("counts a payment due today once, and only future baseline days", () => {
    const projection = projectSpending(days, [item("2026-10-10", 5_000)], "2026-10-10");
    assert.equal(projection.dashed[1].value, 105_000);
  });

  it("has nothing to draw for an invalid or entirely future month", () => {
    assert.equal(projectSpending([], [], "2026-10-10"), null);
    assert.equal(
      projectSpending(
        days.map((entry) => ({ ...entry, future: true })),
        [],
        "2026-10-10",
      ),
      null,
    );
  });
});
