import assert from "node:assert/strict";
import { test } from "node:test";
import { filterHistory, groupHistory, historyForMonth } from "../../data/ledger-history.ts";

function record(overrides = {}) {
  return {
    id: "expense",
    merchant: "Coffee",
    category: "Resto & Cafe",
    amount: 25000,
    currency: "IDR",
    date: "2026-10-17",
    time: null,
    method: "BCA",
    kind: "expense",
    emoji: "",
    confidence: null,
    status: "confirmed",
    ...overrides,
  };
}

test("unified history keeps pending and exclusions, including undated imports", () => {
  const records = [
    record(),
    record({ id: "pending", status: "pending" }),
    record({ id: "internal", kind: "exclusion", category: "Internal" }),
    record({ id: "undated", date: null, status: "pending" }),
    record({ id: "invalid-date", date: "2026-02-30", status: "pending" }),
    record({ id: "old", date: "2026-09-17" }),
  ];
  const month = historyForMonth(records, "2026-10");
  assert.deepEqual(
    month.map((item) => item.id),
    ["expense", "pending", "internal", "undated", "invalid-date"],
  );
  assert.deepEqual(
    filterHistory(month, "", "exclusion", false).map((item) => item.id),
    ["internal"],
  );
  assert.deepEqual(
    filterHistory(month, "", "all", true).map((item) => item.id),
    ["pending", "invalid-date", "undated"],
  );
  assert.deepEqual(
    filterHistory(month, " BCA ", "expense", false).map((item) => item.id),
    ["expense", "pending", "invalid-date", "undated"],
  );
});

test("day subtotals count only confirmed valid IDR expenses, and undated rows remain a visible group", () => {
  const groups = groupHistory([
    record(),
    record({ id: "pending", status: "pending", amount: 500000 }),
    record({ id: "exclusion", kind: "exclusion", amount: 1000000 }),
    record({ id: "income", kind: "income", amount: 8000000 }),
    record({ id: "unsafe", amount: Number.MAX_SAFE_INTEGER + 1 }),
    record({ id: "no-currency", currency: null }),
    record({ id: "undated", date: null, status: "pending" }),
  ]);
  assert.equal(groups[0][0], "2026-10-17");
  assert.equal(groups[0][1].spending, 25000n);
  assert.equal(groups[1][0], "undated");
  assert.equal(groups[1][1].transactions[0].id, "undated");
  assert.equal(groups[1][1].spending, 0n);
});
