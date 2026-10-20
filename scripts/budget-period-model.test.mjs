import assert from "node:assert/strict";
import test from "node:test";
import { summarizeBudgetPeriod } from "../apps/web/src/data/budget-period-model.ts";

const budget = (overrides = {}) => ({
  id: "weekly-food",
  category: "Food & Drinks",
  emoji: "",
  cadence: "weekly",
  limit: 700,
  warningPercent: 80,
  startsOn: "2026-09-25",
  ...overrides,
});
const expense = (date, amount, overrides = {}) => ({
  id: `${date}:${amount}`,
  merchant: "Synthetic cafe",
  category: "Food & Drinks",
  amount,
  currency: "IDR",
  date,
  time: null,
  method: "Cash",
  kind: "expense",
  emoji: "",
  confidence: null,
  status: "confirmed",
  ...overrides,
});

test("weekly gauges use the seven-day reset window even across a month boundary", () => {
  const result = summarizeBudgetPeriod(
    [
      expense("2026-09-24", 10),
      expense("2026-09-25", 100),
      expense("2026-10-01", 200),
      expense("2026-10-02", 300),
      expense("2026-10-01", 999, { kind: "exclusion" }),
      expense("2026-10-01", 999, { status: "pending" }),
    ],
    [budget(), budget({ id: "monthly", cadence: "monthly", limit: 9999 })],
    "weekly",
    "2026-10",
    "2026-10-01",
  );
  assert.deepEqual(result.sharedPeriod, { startsOn: "2026-09-25", endsOn: "2026-10-01" });
  assert.equal(result.totalLimit, 700n);
  assert.equal(result.totalUsed, 300n);
  assert.equal(result.remaining, 400n);
  assert.equal(result.elapsedPercent, 100);
  assert.equal(result.usedPercent, 42);
  assert.equal(result.budgets.length, 1);
});

test("monthly summaries exclude weekly limits and preserve payday windows", () => {
  const result = summarizeBudgetPeriod(
    [expense("2026-09-25", 125), expense("2026-10-01", 25), expense("2026-09-24", 500)],
    [budget(), budget({ id: "monthly", cadence: "monthly", limit: 1000 })],
    "monthly",
    "2026-10",
    "2026-10-01",
  );
  assert.equal(result.totalLimit, 1000n);
  assert.equal(result.totalUsed, 150n);
  assert.deepEqual(result.sharedPeriod, { startsOn: "2026-09-25", endsOn: "2026-10-24" });
  assert.equal(result.elapsedPercent, 23);
});

test("different weekly reset dates never invent a shared elapsed-time marker", () => {
  const result = summarizeBudgetPeriod(
    [],
    [budget(), budget({ id: "transport", category: "Transport", startsOn: "2026-09-26" })],
    "weekly",
    "2026-10",
    "2026-10-01",
  );
  assert.equal(result.sharedPeriod, null);
  assert.equal(result.elapsedPercent, undefined);
  assert.equal(result.totalLimit, 1400n);
});

test("future budgets do not inflate available money and overspending stays visible", () => {
  const result = summarizeBudgetPeriod(
    [expense("2026-10-02", 800)],
    [budget(), budget({ id: "future", startsOn: "2026-10-10", limit: 5000 })],
    "weekly",
    "2026-10",
    "2026-10-02",
  );
  assert.equal(result.totalLimit, 700n);
  assert.equal(result.remaining, 0n);
  assert.equal(result.overBudget, 100n);
  assert.equal(result.usedPercent, 114);
});
