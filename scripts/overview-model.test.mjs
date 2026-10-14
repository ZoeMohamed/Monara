import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      ["./demo-ledger", "./finance-analytics"].includes(specifier) &&
      /\/data\/(overview-model|finance-analytics)\.ts$/.test(context.parentURL ?? "")
    ) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});
const { overviewModel, sceneTime } = await import("../apps/web/src/data/overview-model.ts");
hooks.deregister();

function record(overrides = {}) {
  return {
    id: "synthetic-confirmed",
    merchant: "Synthetic merchant",
    category: "Food & Drinks",
    amount: 10000,
    currency: "IDR",
    date: "2026-10-11",
    time: "08:15",
    method: "BCA",
    kind: "expense",
    emoji: "✦",
    confidence: 99,
    status: "confirmed",
    ...overrides,
  };
}

function budget(category, limit) {
  return { id: category, category, limit, emoji: "✦", cadence: "monthly", warningPercent: 80 };
}

function bill(overrides = {}) {
  return {
    id: "bill",
    merchant: "Synthetic bill",
    emoji: "✦",
    expectedAmount: 10000,
    cadence: "monthly",
    nextDue: "2026-10-14",
    cancellationUrl: null,
    status: "active",
    ...overrides,
  };
}

test("overview figures and recent records only include valid confirmed transactions", () => {
  const model = overviewModel(
    [
      record({ id: "expense", amount: 12 }),
      record({ id: "income", kind: "income", amount: 60 }),
      record({ id: "transfer", kind: "transfer", method: "BCA → Jago", amount: 100 }),
      record({ id: "pending", status: "pending", amount: 100 }),
      record({ id: "rejected", status: "rejected", amount: 100 }),
      record({ id: "invalid", amount: 0 }),
    ],
    [budget("Food & Drinks", 100)],
    [],
    "2026-10",
  );
  assert.equal(model.summary.spending, 12n);
  assert.equal(model.summary.income, 60n);
  assert.equal(model.summary.difference, 48n);
  assert.equal(model.todaySpending, 12n);
  assert.equal(model.todayCount, 1);
  assert.equal(model.expenseCount, 1);
  assert.equal(model.budgetUsed, 12n);
  assert.equal(model.pendingCount, 1);
  assert.deepEqual(
    model.recent.map(({ id }) => id),
    ["expense", "income", "transfer"],
  );
});

test("budget attention prioritizes exact overspending over at-limit and warning states", () => {
  const model = overviewModel(
    [
      record({ category: "Digital", amount: 101 }),
      record({ category: "Food & Drinks", amount: 100 }),
      record({ category: "Transport", amount: 80 }),
      record({ category: "Shopping", amount: 25 }),
      record({ category: "Shopping", amount: 999, status: "pending" }),
    ],
    [
      budget("Food & Drinks", 100),
      budget("Transport", 100),
      budget("Digital", 100),
      budget("Shopping", 100),
    ],
    [],
    "2026-10",
  );
  assert.equal(model.attentionBudget.budget.category, "Digital");
  assert.equal(model.attentionBudget.state, "over");
  assert.equal(model.overAmount, 1n);
  assert.equal(model.overBudgetCount, 1);
  assert.equal(model.budgetUsed, 306n);
  assert.equal(model.budgetTotal, 400n);
  assert.equal(model.remaining, 95n);
  const atLimit = overviewModel(
    [record({ amount: 100 })],
    [budget("Food & Drinks", 100)],
    [],
    "2026-10",
  );
  assert.equal(atLimit.attentionBudget.state, "at-limit");
  assert.equal(atLimit.remaining, 0n);
  assert.equal(atLimit.overAmount, 0n);
  assert.equal(atLimit.overBudgetCount, 0);
});

test("overview sums and overspending remain exact beyond safe-number totals", () => {
  const model = overviewModel(
    [record({ amount: Number.MAX_SAFE_INTEGER }), record({ amount: Number.MAX_SAFE_INTEGER })],
    [budget("Food & Drinks", Number.MAX_SAFE_INTEGER)],
    [],
    "2026-10",
  );
  assert.equal(model.todaySpending, 18014398509481982n);
  assert.equal(model.budgetUsed, 18014398509481982n);
  assert.equal(model.overAmount, 9007199254740991n);
  assert.equal(model.remaining, 0n);
  assert.equal(model.percent, 200);
});

test("bill attention includes confirmed due dates this week in order and leaves suggestions out", () => {
  const bills = [
    bill({ id: "later", nextDue: "2026-10-17" }),
    bill({ id: "tomorrow", nextDue: "2026-10-12" }),
    bill({ id: "today", nextDue: "2026-10-11" }),
    bill({ id: "overdue", nextDue: "2026-10-10" }),
    bill({ id: "next-week", nextDue: "2026-10-18" }),
    bill({ id: "suggested", nextDue: "2026-10-11", status: "suggested" }),
  ];
  const model = overviewModel([], [], bills, "2026-10");
  assert.equal(model.nextBill.id, "today");
  assert.equal(model.upcomingBillCount, 3);
  for (const month of ["2026-09", "2026-11"]) {
    const outsideCurrent = overviewModel([], [], bills, month);
    assert.equal(outsideCurrent.nextBill, undefined);
    assert.equal(outsideCurrent.upcomingBillCount, 0);
    assert.equal(outsideCurrent.todayCount, 0);
  }
});

test("empty and transfer-only months have actionable empty state without invented spending", () => {
  const empty = overviewModel([], [], [], "2026-10");
  assert.equal(empty.emptyTitle, "Start tracking");
  assert.equal(empty.hasFinancialActivity, false);
  assert.equal(empty.percent, 0);
  assert.equal(empty.comparison.state, "no-baseline");
  const transferOnly = overviewModel(
    [record({ kind: "transfer", method: "BCA → Jago" }), record({ status: "pending" })],
    [],
    [],
    "2026-10",
  );
  assert.equal(transferOnly.emptyTitle, "No income or expenses this month");
  assert.equal(transferOnly.hasFinancialActivity, false);
  assert.equal(transferOnly.summary.spending, 0n);
  assert.equal(transferOnly.summary.income, 0n);
  assert.equal(transferOnly.pendingCount, 1);
  assert.equal(transferOnly.recent.length, 1);
});

test("greeting boundaries never change the sample financial period", () => {
  assert.equal(sceneTime(5), "night");
  assert.equal(sceneTime(6), "morning");
  assert.equal(sceneTime(11), "morning");
  assert.equal(sceneTime(12), "afternoon");
  assert.equal(sceneTime(16), "afternoon");
  assert.equal(sceneTime(17), "evening");
  assert.equal(sceneTime(19), "evening");
  assert.equal(sceneTime(20), "night");
  assert.equal(sceneTime(23), "night");
});
