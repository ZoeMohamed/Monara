import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  detectCandidates,
  endOfMonth,
  endOfWeek,
  forecastAccuracy,
  forecastTotals,
  matchRealized,
  merchantKey,
  selectItems,
} from "./forecast.ts";

// Synthetic payments only. Every merchant and amount is invented.
const pad = (value) => String(value).padStart(2, "0");
const date = (month, day) => `2026-${pad(month)}-${pad(day)}`;
let counter = 0;
const expense = (occurredOn, merchantName, amount) => ({
  id: `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
  occurredOn,
  merchantName,
  categoryId: null,
  amount,
});

/** Four months of one person's spending, with a habit, three bills, and noise. */
function payments({ until }) {
  const list = [];
  for (let month = 6; month <= 10; month++) {
    list.push(expense(date(month, 20), "YouTube Premium", 59_000));
    if (month <= 9) list.push(expense(date(month, 25), "Spotify", 54_990));
    if (month >= 7 && month <= 9) list.push(expense(date(month, 28), "Netflix", 186_000));
    if (month <= 8) list.push(expense(date(month, 5), "Old Gym", 350_000));
  }
  // A habit: chicken rice every Monday, Wednesday and Friday, with the price drifting a little.
  for (let day = Date.UTC(2026, 5, 1); day <= Date.UTC(2026, 9, 31); day += 86_400_000) {
    const current = new Date(day);
    const weekday = current.getUTCDay();
    if (weekday === 1 || weekday === 3 || weekday === 5) {
      const index = Math.round((day - Date.UTC(2026, 5, 1)) / 86_400_000);
      list.push(
        expense(
          current.toISOString().slice(0, 10),
          "Ayam Geprek Bu Sri",
          24_000 + (index % 4) * 1_000,
        ),
      );
    }
  }
  // Noise that follows no pattern.
  list.push(expense(date(7, 11), "Tokopedia", 640_000));
  for (const [month, day, amount] of [
    [6, 3, 31_000],
    [6, 17, 22_000],
    [7, 9, 48_000],
    [8, 22, 15_000],
    [9, 2, 67_000],
    [9, 28, 19_000],
  ]) {
    list.push(expense(date(month, day), "Gojek", amount));
  }
  return list.filter((item) => item.occurredOn < until);
}

describe("merchantKey", () => {
  it("groups the same merchant written different ways", () => {
    assert.equal(merchantKey("SPOTIFY AB 123"), merchantKey("Spotify ab"));
    assert.equal(merchantKey(null), null);
    assert.equal(merchantKey("   "), null);
  });
});

describe("date helpers", () => {
  it("finds the end of the month and of the week", () => {
    assert.equal(endOfMonth("2026-02-10"), "2026-02-28");
    assert.equal(endOfMonth("2026-10-18"), "2026-10-31");
    assert.equal(endOfWeek("2026-10-14"), "2026-10-18");
    assert.equal(endOfWeek("2026-10-18"), "2026-10-18");
  });
});

describe("detectCandidates", () => {
  const today = "2026-10-14";
  const found = detectCandidates(payments({ until: today }), today);
  const byKey = new Map(found.map((candidate) => [candidate.key, candidate]));

  it("finds bills that repeat on a day of the month", () => {
    assert.deepEqual(
      byKey.get("youtube premium")?.payments.map((p) => p.predictedOn),
      ["2026-10-20"],
    );
    assert.deepEqual(
      byKey.get("spotify")?.payments.map((p) => p.predictedOn),
      ["2026-10-25"],
    );
    assert.deepEqual(
      byKey.get("netflix")?.payments.map((p) => p.predictedOn),
      ["2026-10-28"],
    );
    assert.equal(byKey.get("youtube premium")?.pattern, "monthly");
    assert.equal(byKey.get("youtube premium")?.payments[0]?.amount, 59_000);
  });

  it("finds a habit that repeats on days of the week", () => {
    const habit = byKey.get("ayam geprek bu sri");
    assert.equal(habit?.pattern, "weekly");
    assert.deepEqual(
      habit?.payments.map((p) => p.predictedOn),
      [
        "2026-10-14",
        "2026-10-16",
        "2026-10-19",
        "2026-10-21",
        "2026-10-23",
        "2026-10-26",
        "2026-10-28",
        "2026-10-30",
      ],
    );
    assert.match(habit?.reason ?? "", /Mondays, Wednesdays and Fridays/);
  });

  it("ignores a cancelled subscription and one-off or irregular spending", () => {
    assert.equal(byKey.has("old gym"), false);
    assert.equal(byKey.has("tokopedia"), false);
    assert.equal(byKey.has("gojek"), false);
  });

  it("never predicts something already paid this month", () => {
    const withPaid = [
      ...payments({ until: today }),
      expense("2026-10-10", "YouTube Premium", 59_000),
    ];
    assert.equal(
      detectCandidates(withPaid, today).some((candidate) => candidate.key === "youtube premium"),
      false,
    );
  });

  it("does not predict a habit again on a day it was already done", () => {
    const paid = [
      ...payments({ until: "2026-10-14" }),
      expense("2026-10-14", "Ayam Geprek Bu Sri", 25_000),
    ];
    const habit = detectCandidates(paid, "2026-10-14").find(
      (candidate) => candidate.key === "ayam geprek bu sri",
    );
    assert.equal(habit?.payments[0]?.predictedOn, "2026-10-16");
  });

  it("gives steady, repeated payments a higher confidence than shaky ones", () => {
    const steady = byKey.get("youtube premium")?.ruleConfidence ?? 0;
    const fewer = byKey.get("netflix")?.ruleConfidence ?? 0;
    assert.ok(steady > 0.9);
    assert.ok(fewer < steady);
    assert.ok((byKey.get("ayam geprek bu sri")?.ruleConfidence ?? 0) > 0.9);
  });

  it("needs history: an empty ledger predicts nothing", () => {
    assert.deepEqual(detectCandidates([], today), []);
  });
});

describe("selectItems", () => {
  const today = "2026-10-14";
  const candidates = detectCandidates(payments({ until: today }), today);

  it("keeps candidates at or above the threshold and counts the rest", () => {
    const strict = selectItems(candidates, null, 0.95);
    assert.equal(strict.candidateCount, candidates.length);
    assert.ok(strict.discardedCount > 0);
    assert.equal(
      strict.items.every((item) => item.confidence >= 0.95),
      true,
    );
    const everything = selectItems(candidates, null, 0);
    assert.equal(everything.discardedCount, 0);
  });

  it("lets a model lower or raise confidence only within a small band", () => {
    const youtube = candidates.find((candidate) => candidate.key === "youtube premium");
    assert.ok(youtube);
    const low = selectItems(
      [youtube],
      [{ key: "youtube premium", confidence: 0, reason: "Looks cancelled." }],
      0,
    );
    assert.equal(low.items[0]?.confidence, Number((youtube.ruleConfidence - 0.25).toFixed(3)));
    assert.equal(low.items[0]?.reason, "Looks cancelled.");
    const high = selectItems(
      [youtube],
      [{ key: "youtube premium", confidence: 1, reason: "Very regular." }],
      0,
    );
    assert.ok((high.items[0]?.confidence ?? 0) <= 1);
  });

  it("drops a candidate the model marks down below the threshold", () => {
    const netflix = candidates.find((candidate) => candidate.key === "netflix");
    assert.ok(netflix);
    const result = selectItems(
      [netflix],
      [{ key: "netflix", confidence: 0.1, reason: "Probably cancelled." }],
      0.85,
    );
    assert.equal(result.items.length, 0);
    assert.equal(result.discardedCount, 1);
  });

  it("never invents an item the rules did not find", () => {
    const result = selectItems(
      candidates,
      [{ key: "made up merchant", confidence: 1, reason: "Trust me." }],
      0,
    );
    assert.equal(
      result.items.some((item) => item.merchantName === "made up merchant"),
      false,
    );
  });

  it("falls back to the rule confidence and reason without a judgement", () => {
    const result = selectItems(candidates, null, 0.7);
    assert.ok(result.items.every((item) => item.reason.length > 0));
  });
});

describe("forecastTotals", () => {
  it("adds up the rest of the week and month and never counts realized items", () => {
    const items = [
      { predictedOn: "2026-10-14", amount: 25_000, realized: true },
      { predictedOn: "2026-10-16", amount: 25_000, realized: false },
      { predictedOn: "2026-10-20", amount: 59_000, realized: false },
      { predictedOn: "2026-10-25", amount: 54_990, realized: false },
    ];
    const totals = forecastTotals(items, 1_000_000, "2026-10-14");
    assert.equal(totals.weekRemaining, 25_000);
    assert.equal(totals.monthRemaining, 25_000 + 59_000 + 54_990);
    assert.equal(totals.monthSpentSoFar, 1_000_000);
    assert.equal(totals.projectedMonthEnd, 1_000_000 + 138_990);
  });
});

describe("backtest on synthetic history", () => {
  // Forecast on 1 October, then compare with what really happened in October. In this October the
  // person cancelled Netflix, skipped chicken rice on the 14th, paid more for Spotify, and started
  // a new subscription that no earlier payment could have predicted.
  const cutoff = "2026-10-01";
  const history = payments({ until: cutoff });
  const draft = selectItems(detectCandidates(history, cutoff), null, 0.7);

  const actual = payments({ until: "2026-11-01" })
    .filter((item) => item.occurredOn >= cutoff)
    .filter((item) => !(item.merchantName === "Netflix") && item.occurredOn !== "2026-10-14")
    .map((item) => (item.merchantName === "Spotify" ? { ...item, amount: 69_000 } : item));
  actual.push(expense("2026-10-25", "Spotify", 69_000));
  actual.push(expense("2026-10-10", "Disney Hotstar", 39_000));

  it("predicts the bills and the habit for the rest of the month", () => {
    const merchants = new Set(draft.items.map((item) => item.merchantName));
    assert.deepEqual([...merchants].sort(), [
      "Ayam Geprek Bu Sri",
      "Netflix",
      "Spotify",
      "YouTube Premium",
    ]);
  });

  it("measures hit rate and amount error once the month has passed", () => {
    const today = "2026-11-01";
    const matches = matchRealized(draft.items, actual, today);
    const accuracy = forecastAccuracy(draft.items, matches, today);
    assert.equal(accuracy.due, draft.items.length);
    assert.equal(accuracy.due, 16);
    assert.equal(accuracy.realized, 14);
    assert.equal(accuracy.meanAbsoluteErrorPercent?.toFixed(1), "5.2");
    // One chicken-rice day, Netflix, and nothing else is missed.
    assert.equal(accuracy.realized, accuracy.due - 2);
    assert.ok((accuracy.meanAbsoluteErrorPercent ?? 100) < 8);
  });

  it("matches a payment only once", () => {
    const items = [
      { predictedOn: "2026-10-20", merchantName: "YouTube Premium", amount: 59_000 },
      { predictedOn: "2026-10-21", merchantName: "YouTube Premium", amount: 59_000 },
    ];
    const one = [expense("2026-10-20", "YouTube Premium", 59_000)];
    assert.equal(matchRealized(items, one, "2026-10-25").length, 1);
  });

  it("does not match a different merchant, a faraway date or a very different amount", () => {
    const item = [{ predictedOn: "2026-10-20", merchantName: "YouTube Premium", amount: 59_000 }];
    assert.equal(
      matchRealized(item, [expense("2026-10-20", "Spotify", 59_000)], "2026-10-25").length,
      0,
    );
    assert.equal(
      matchRealized(item, [expense("2026-10-26", "YouTube Premium", 59_000)], "2026-10-30").length,
      0,
    );
    assert.equal(
      matchRealized(item, [expense("2026-10-20", "YouTube Premium", 120_000)], "2026-10-25").length,
      0,
    );
  });

  it("does not match a prediction whose date has not come", () => {
    const item = [{ predictedOn: "2026-10-20", merchantName: "YouTube Premium", amount: 59_000 }];
    assert.equal(
      matchRealized(item, [expense("2026-10-20", "YouTube Premium", 59_000)], "2026-10-19").length,
      0,
    );
  });

  it("ignores payments made before the forecast existed", () => {
    const item = [
      { predictedOn: "2026-10-14", merchantName: "Ayam Geprek Bu Sri", amount: 25_000 },
    ];
    const monday = [expense("2026-10-12", "Ayam Geprek Bu Sri", 25_000)];
    // Two days away and the same amount, so it would match without a lower bound.
    assert.equal(matchRealized(item, monday, "2026-10-14").length, 1);
    assert.equal(matchRealized(item, monday, "2026-10-14", "2026-10-14").length, 0);
    const today = [expense("2026-10-14", "Ayam Geprek Bu Sri", 25_000)];
    assert.equal(matchRealized(item, today, "2026-10-14", "2026-10-14").length, 1);
  });
});
