import assert from "node:assert/strict";
import test from "node:test";
import {
  filterHistory,
  groupHistory,
  historyForMonth,
} from "../apps/web/src/data/ledger-history.ts";

function record(overrides = {}) {
  return {
    id: "expense",
    merchant: "Synthetic merchant",
    category: "Resto & Cafe",
    amount: 100,
    currency: "IDR",
    date: "2026-10-11",
    time: "08:15",
    method: "BCA",
    kind: "expense",
    emoji: "•",
    confidence: null,
    status: "confirmed",
    ...overrides,
  };
}

test("history combines pending and confirmed records while keeping undated imports visible", () => {
  const records = [
    record(),
    record({ id: "pending", status: "pending" }),
    record({ id: "excluded", kind: "exclusion", category: "Internal" }),
    record({ id: "undated", date: null, status: "pending" }),
    record({ id: "malformed-date", date: "2026-02-30", status: "pending" }),
    record({ id: "other-month", date: "2026-09-30" }),
  ];
  assert.deepEqual(
    historyForMonth(records, "2026-10").map(({ id }) => id),
    ["expense", "pending", "excluded", "undated", "malformed-date"],
  );
});

test("history filters search, transaction kind and review without changing source records", () => {
  const records = [
    record({ id: "confirmed" }),
    record({ id: "pending", status: "pending", date: "2026-10-12" }),
    record({ id: "excluded", kind: "exclusion", category: "Internal", status: "pending" }),
  ];
  assert.deepEqual(
    filterHistory(records, "  bca ", "all", true).map(({ id }) => id),
    ["pending", "excluded"],
  );
  assert.deepEqual(
    filterHistory(records, "internal", "exclusion", false).map(({ id }) => id),
    ["excluded"],
  );
  assert.deepEqual(filterHistory(records, "merchant", "income", false), []);
  assert.deepEqual(
    records.map(({ id }) => id),
    ["confirmed", "pending", "excluded"],
  );
});

test("day-group spending matches valid confirmed expense totals and preserves exact money", () => {
  const groups = new Map(
    groupHistory([
      record({ id: "first", amount: Number.MAX_SAFE_INTEGER }),
      record({ id: "second", amount: Number.MAX_SAFE_INTEGER }),
      record({ id: "income", kind: "income", amount: 999 }),
      record({ id: "excluded", kind: "exclusion", category: "Internal", amount: 999 }),
      record({ id: "pending", status: "pending", amount: 999 }),
      record({ id: "invalid-currency", currency: null, amount: 999 }),
      record({ id: "invalid-category", category: "Internal", amount: 999 }),
      record({ id: "undated", date: null, amount: 999 }),
      record({ id: "invalid-date", date: "2026-02-30", amount: 999 }),
    ]),
  );
  assert.equal(groups.get("2026-10-11").spending, 18014398509481982n);
  assert.equal(groups.get("undated").spending, 0n);
  assert.equal(groups.get("undated").transactions.length, 2);
});
