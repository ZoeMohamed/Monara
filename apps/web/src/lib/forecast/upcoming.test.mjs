import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { groupForecastByDay, upcomingForecastItems } from "./upcoming.ts";

let counter = 0;
const item = (predictedOn, merchantName, amount, realizedTransactionId = null) => ({
  id: `a0000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
  predictedOn,
  merchantName,
  categoryId: null,
  amount: { amountMinor: String(amount), currency: "IDR" },
  amountLow: { amountMinor: String(amount), currency: "IDR" },
  amountHigh: { amountMinor: String(amount), currency: "IDR" },
  confidence: 0.9,
  pattern: "monthly",
  reason: "Paid monthly.",
  realizedTransactionId,
});

const items = [
  item("2026-10-13", "Old habit", 25_000),
  item("2026-10-14", "Ayam Geprek", 25_000, "91000000-0000-4000-8000-000000000001"),
  item("2026-10-14", "Spotify", 54_990),
  item("2026-10-20", "YouTube Premium", 59_000),
  item("2026-10-14", "Ayam Geprek 2", 25_000),
];

describe("upcomingForecastItems", () => {
  it("keeps what is still ahead and drops the past and what already came true", () => {
    const names = upcomingForecastItems(items, "2026-10-14").map((entry) => entry.merchantName);
    assert.deepEqual(names, ["Spotify", "YouTube Premium", "Ayam Geprek 2"]);
  });

  it("includes today and filters by the search text, ignoring case", () => {
    assert.deepEqual(
      upcomingForecastItems(items, "2026-10-14", "  SPOT").map((entry) => entry.merchantName),
      ["Spotify"],
    );
    assert.deepEqual(upcomingForecastItems(items, "2026-10-14", "nothing"), []);
  });
});

describe("groupForecastByDay", () => {
  it("groups by day, soonest first, with the day's expected total", () => {
    const days = groupForecastByDay(upcomingForecastItems(items, "2026-10-14"));
    assert.deepEqual(
      days.map((day) => day.date),
      ["2026-10-14", "2026-10-20"],
    );
    assert.equal(days[0].total, BigInt(54_990 + 25_000));
    assert.deepEqual(
      days[0].items.map((entry) => entry.merchantName),
      ["Ayam Geprek 2", "Spotify"],
    );
  });

  it("returns nothing for nothing", () => {
    assert.deepEqual(groupForecastByDay([]), []);
  });
});
