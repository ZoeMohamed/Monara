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
      record({ id: "pending", status: "pending", amount: 100 }),
      record({ id: "excluded", kind: "exclusion", amount: 100 }),
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
    ["expense", "income"],
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

test("empty and exclusion-only months have actionable empty state without invented spending", () => {
  const empty = overviewModel([], [], [], "2026-10");
  assert.equal(empty.emptyTitle, "Start tracking");
  assert.equal(empty.hasFinancialActivity, false);
  assert.equal(empty.percent, 0);
  assert.equal(empty.comparison.state, "no-baseline");
  const excludedOnly = overviewModel(
    [record({ kind: "exclusion" }), record({ status: "pending" })],
    [],
    [],
    "2026-10",
  );
  assert.equal(excludedOnly.emptyTitle, "No income or expenses this month");
  assert.equal(excludedOnly.hasFinancialActivity, false);
  assert.equal(excludedOnly.summary.spending, 0n);
  assert.equal(excludedOnly.summary.income, 0n);
  assert.equal(excludedOnly.pendingCount, 1);
  assert.equal(excludedOnly.recent.length, 0);
});

test("latest activity shows the five newest confirmed records, across months only for the current one", () => {
  const ledger = [
    record({ id: "oct-2", date: "2026-10-02", time: "09:00" }),
    record({ id: "oct-1", date: "2026-10-01", time: "18:00" }),
    record({ id: "oct-1-early", date: "2026-10-01", time: "07:00" }),
    record({ id: "sep-30", date: "2026-09-30", time: "12:00" }),
    record({ id: "sep-29", date: "2026-09-29", time: "12:00" }),
    record({ id: "sep-28", date: "2026-09-28", time: "12:00" }),
    record({ id: "future", date: "2026-10-20" }),
    record({ id: "pending", date: "2026-10-02", time: "10:00", status: "pending" }),
    record({ id: "invalid", date: "2026-10-02", time: "11:00", amount: 0 }),
  ];
  const current = overviewModel(ledger, [], [], "2026-10", "2026-10-02");
  assert.deepEqual(
    current.recent.map(({ id }) => id),
    ["oct-2", "oct-1", "oct-1-early", "sep-30", "sep-29"],
  );
  const past = overviewModel(ledger, [], [], "2026-09", "2026-10-02");
  assert.deepEqual(
    past.recent.map(({ id }) => id),
    ["sep-30", "sep-29", "sep-28"],
  );
});

test("attention lists overdue bills first, then over-budget, due-soon, near-limit and review", () => {
  const model = overviewModel(
    [
      record({ category: "Digital", amount: 150 }),
      record({ category: "Transport", amount: 85 }),
      record({ status: "pending" }),
    ],
    [budget("Transport", 100), budget("Digital", 100), budget("Food & Drinks", 100)],
    [
      bill({ id: "late", nextDue: "2026-10-08" }),
      bill({ id: "soon", nextDue: "2026-10-13" }),
      bill({ id: "later", nextDue: "2026-10-30" }),
      bill({ id: "suggested", nextDue: "2026-10-05", status: "suggested" }),
    ],
    "2026-10",
    "2026-10-11",
  );
  assert.deepEqual(
    model.attention.map((item) =>
      item.kind === "budget"
        ? `budget:${item.usage.budget.category}:${item.usage.state}`
        : item.kind === "review"
          ? `review:${item.count}`
          : `${item.kind}:${item.bill.id}:${item.days}`,
    ),
    [
      "bill-overdue:late:3",
      "budget:Digital:over",
      "bill-due:soon:2",
      "budget:Transport:warning",
      "review:1",
    ],
  );
  const past = overviewModel([], [], [bill({ nextDue: "2026-09-01" })], "2026-09", "2026-10-11");
  assert.deepEqual(past.attention, []);
});

test("month facts state only what confirmed records show", () => {
  const model = overviewModel(
    [
      record({ id: "big", category: "Digital", amount: 300, date: "2026-10-02" }),
      record({ id: "small", category: "Transport", amount: 100, date: "2026-10-03" }),
      record({ id: "pending", category: "Shopping", amount: 9000, status: "pending" }),
    ],
    [],
    [],
    "2026-10",
    "2026-10-04",
  );
  assert.deepEqual(model.facts.topCategory, { name: "Digital", share: 75 });
  assert.equal(model.facts.dailyAverage, 100n);
  assert.equal(model.facts.largest?.id, "big");
  const empty = overviewModel([], [], [], "2026-10", "2026-10-04");
  assert.equal(empty.facts.topCategory, null);
  assert.equal(empty.facts.dailyAverage, null);
  assert.equal(empty.facts.largest, null);
});

test("current-month daily average excludes future confirmed payments", () => {
  const model = overviewModel(
    [
      record({ id: "paid", amount: 400, date: "2026-10-02" }),
      record({ id: "future", amount: 9000, date: "2026-10-20" }),
    ],
    [],
    [],
    "2026-10",
    "2026-10-04",
  );
  assert.equal(model.summary.spending, 9400n);
  assert.equal(model.facts.dailyAverage, 100n);
  assert.deepEqual(
    model.recent.map(({ id }) => id),
    ["paid"],
  );
});

test("payday budgets show actual period headroom without a calendar daily guide", () => {
  const model = overviewModel(
    [record({ amount: 30, date: "2026-09-28" }), record({ amount: 20, date: "2026-10-03" })],
    [{ ...budget("Food & Drinks", 100), startsOn: "2026-09-25" }],
    [],
    "2026-10",
    "2026-10-11",
  );
  assert.equal(model.calendarBudgetPeriods, false);
  assert.equal(model.safeToSpend, null);
  assert.equal(model.budgetUsed, 50n);
  assert.equal(model.remaining, 50n);
  assert.equal(model.usage[0].periodStartsOn, "2026-09-25");
  assert.equal(model.usage[0].periodEndsOn, "2026-10-24");
});

test("budgets that have not started do not inflate active headroom", () => {
  const model = overviewModel(
    [],
    [{ ...budget("Food & Drinks", 100), startsOn: "2026-10-25" }],
    [],
    "2026-10",
    "2026-10-11",
  );
  assert.equal(model.budgetTotal, 0n);
  assert.equal(model.remaining, 0n);
  assert.equal(model.usage.length, 0);
  assert.equal(model.safeToSpend, null);
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

test("weekly chart counts valid confirmed expenses through today in a Monday-to-Sunday window", () => {
  const model = overviewModel(
    [
      record({ id: "start", date: "2026-10-05", amount: 100 }),
      record({ id: "today", date: "2026-10-07", amount: 200 }),
      record({ id: "previous", date: "2026-10-04", amount: 800 }),
      record({ id: "future", date: "2026-10-08", amount: 800 }),
      record({ id: "pending", date: "2026-10-07", amount: 800, status: "pending" }),
      record({ id: "income", date: "2026-10-07", amount: 800, kind: "income" }),
      record({
        id: "excluded",
        date: "2026-10-07",
        amount: 800,
        kind: "exclusion",
        category: "Internal",
      }),
      record({ id: "invalid", date: "2026-10-07", amount: 0 }),
    ],
    [budget("Food & Drinks", 3100)],
    [],
    "2026-10",
    "2026-10-07",
  );
  assert.equal(model.weekly.startsOn, "2026-10-05");
  assert.equal(model.weekly.endsOn, "2026-10-11");
  assert.equal(model.weekly.spending, 300n);
  assert.equal(model.weekly.count, 2);
  assert.equal(model.weekly.limit, 700n);
  assert.equal(model.weekly.remaining, 400n);
  assert.equal(model.weekly.basis, "monthly-guide");
  assert.equal(model.weekly.percent, 42);
  assert.equal(model.weekly.elapsedPercent, 43);
  assert.deepEqual(
    model.weekly.days.map((day) => day.spending),
    [100n, 0n, 200n, 0n, 0n, 0n, 0n],
  );
  assert.deepEqual(
    model.weekly.days.map((day) => day.future),
    [false, false, false, true, true, true, true],
  );
  assert.equal(overviewModel([], [], [], "2026-09", "2026-10-07").weekly, null);
});

test("weekly allocation follows the actual monthly periods across calendar and payday boundaries", () => {
  const crossMonth = overviewModel(
    [],
    [budget("Food & Drinks", 3100)],
    [],
    "2026-10",
    "2026-10-01",
  );
  assert.equal(crossMonth.weekly.startsOn, "2026-09-28");
  // Three days of September's 30-day limit, then four of October's 31-day limit.
  assert.equal(crossMonth.weekly.limit, 710n);
  const payday = overviewModel(
    [],
    [{ ...budget("Food & Drinks", 3000), startsOn: "2026-09-25" }],
    [],
    "2026-10",
    "2026-10-01",
  );
  assert.equal(payday.weekly.limit, 700n);
  const startsThisWeek = overviewModel(
    [],
    [{ ...budget("Food & Drinks", 3100), startsOn: "2026-10-01" }],
    [],
    "2026-10",
    "2026-10-01",
  );
  assert.equal(startsThisWeek.weekly.limit, 400n);
});

function weeklyBudget(overrides = {}) {
  return {
    id: "weekly-food",
    categoryId: "food-id",
    name: "Weekly food",
    cadence: "weekly",
    limit: { amountMinor: "1000", currency: "IDR" },
    warningPercent: 80,
    startsOn: "2026-10-02",
    isActive: true,
    deletedAt: null,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

test("native weekly budgets use their shared reset period and only covered category expenses", () => {
  const model = overviewModel(
    [
      record({ date: "2026-10-02", amount: 200, categoryId: "food-id" }),
      record({ date: "2026-10-07", amount: 900, categoryId: "food-id" }),
      record({ date: "2026-10-07", amount: 900, categoryId: "other-id" }),
      record({ date: "2026-10-08", amount: 900, categoryId: "food-id" }),
      record({ date: "2026-10-07", amount: 900, categoryId: "food-id", status: "pending" }),
    ],
    [budget("Food & Drinks", 3100)],
    [],
    "2026-10",
    "2026-10-07",
    [
      weeklyBudget(),
      weeklyBudget({ id: "inactive", isActive: false }),
      weeklyBudget({ id: "future", startsOn: "2026-10-09" }),
    ],
  );
  assert.equal(model.weekly.startsOn, "2026-10-02");
  assert.equal(model.weekly.endsOn, "2026-10-08");
  assert.equal(model.weekly.spending, 1100n);
  assert.equal(model.weekly.limit, 1000n);
  assert.equal(model.weekly.percent, 110);
  assert.equal(model.weekly.remaining, 0n);
  assert.equal(model.weekly.over, 100n);
  assert.equal(model.weekly.budgetCount, 1);
  assert.equal(model.weekly.basis, "weekly-budgets");
});

test("weekly empty and differently anchored budget states never invent a shared limit", () => {
  const empty = overviewModel([], [], [], "2026-10", "2026-10-07").weekly;
  assert.equal(empty.limit, 0n);
  assert.equal(empty.percent, null);
  assert.equal(empty.basis, null);
  assert.equal(empty.spending, 0n);
  const budgets = [weeklyBudget(), weeklyBudget({ id: "weekly-other", startsOn: "2026-10-03" })];
  const mixed = overviewModel([], [], [], "2026-10", "2026-10-07", budgets).weekly;
  assert.equal(mixed.startsOn, "2026-10-05");
  assert.equal(mixed.basis, null);
  assert.equal(mixed.hasDifferentWeeklyPeriods, true);
  assert.equal(mixed.limit, 0n);
  const monthlyFallback = overviewModel(
    [],
    [budget("Food & Drinks", 3100)],
    [],
    "2026-10",
    "2026-10-07",
    budgets,
  ).weekly;
  assert.equal(monthlyFallback.basis, "monthly-guide");
  assert.equal(monthlyFallback.limit, 700n);
});
