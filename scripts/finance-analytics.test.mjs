import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

// The app's bundler resolves extensionless TypeScript imports; keep that behavior in Node tests.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === "./demo-ledger" &&
      context.parentURL?.endsWith("/data/finance-analytics.ts")
    ) {
      return nextResolve("./demo-ledger.ts", context);
    }
    return nextResolve(specifier, context);
  },
});
const {
  cashFlowMonths,
  categoryContainsTransaction,
  categoryKey,
  categoryMatchesBudget,
  chartRatio,
  compactAmount,
  financialMonth,
  financialYear,
  financialSummaryModel,
  monthComparison,
  yearComparison,
} = await import("../apps/web/src/data/finance-analytics.ts");
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

test("analytics excludes pending, rejected, invalid, and transfer records from every visual", () => {
  const records = [
    record({ id: "expense", amount: 12000 }),
    record({ id: "income", kind: "income", amount: 60000 }),
    record({ id: "pending", status: "pending", amount: 99999 }),
    record({ id: "rejected", status: "rejected", amount: 99999 }),
    record({ id: "invalid", amount: 0 }),
    record({ id: "date-invalid", date: "2026-10-32", amount: 99999 }),
    record({ id: "currency-invalid", currency: "USD", amount: 99999 }),
    record({ id: "transfer", kind: "transfer", method: "BCA → Jago", amount: 99999 }),
    record({ id: "other-month", date: "2026-09-30", amount: 99999 }),
  ];
  const result = financialMonth(records, "2026-10");
  assert.equal(result.spending, 12000n);
  assert.equal(result.income, 60000n);
  assert.equal(result.difference, 48000n);
  assert.equal(result.confirmedCount, 2);
  assert.equal(result.activeDays, 1);
  assert.deepEqual(result.categories, [{ name: "Food & Drinks", amount: 12000n, count: 1 }]);
  assert.deepEqual(
    result.days[10].transactions.map(({ id }) => id),
    ["expense", "income"],
  );
  assert.equal(result.days[10].spending, 12000n);
  assert.equal(result.days[10].income, 60000n);
});

test("yearly finance totals use actual confirmed dates and exclude transfers, incomplete and other-year records", () => {
  const records = [
    record({ id: "leap-day", date: "2024-02-29", amount: 100 }),
    record({ id: "new-year", date: "2024-01-01", kind: "income", amount: 500 }),
    record({ id: "last-day", date: "2024-12-31", amount: 200 }),
    record({ id: "previous", date: "2023-12-31", amount: 999 }),
    record({ id: "next", date: "2025-01-01", amount: 999 }),
    record({ id: "invalid-leap", date: "2023-02-29", amount: 999 }),
    record({ id: "pending", date: "2024-02-29", status: "pending", amount: 999 }),
    record({ id: "rejected", date: "2024-02-29", status: "rejected", amount: 999 }),
    record({ id: "invalid", date: "2024-02-29", currency: null, amount: 999 }),
    record({
      id: "transfer",
      date: "2024-02-29",
      kind: "transfer",
      method: "BCA → Jago",
      amount: 999,
    }),
  ];
  const year = financialYear(records, "2024", "2024-02-29");
  assert.equal(year.income, 500n);
  assert.equal(year.spending, 300n);
  assert.equal(year.difference, 200n);
  assert.equal(year.months.length, 12);
  assert.equal(year.months[1].days.length, 29);
  assert.equal(year.months[1].spending, 100n);
  assert.equal(year.months[11].spending, 200n);
  assert.equal(year.months[2].spending, 0n);
  assert.deepEqual(
    year.confirmed.map(({ id }) => id),
    ["new-year", "leap-day", "transfer", "last-day"],
  );
});

test("year categories preserve owned identity across months and exact bigint totals", () => {
  const first = record({
    id: "first",
    date: "2026-01-01",
    amount: Number.MAX_SAFE_INTEGER,
    category: "Food",
    categoryId: "owned-food",
  });
  const second = record({
    id: "second",
    date: "2026-12-31",
    amount: Number.MAX_SAFE_INTEGER,
    category: "Dining",
    categoryId: "owned-food",
  });
  const third = record({
    id: "third",
    date: "2026-02-01",
    amount: 1,
    category: "Dining",
    categoryId: "different-category",
  });
  const records = Object.freeze([
    Object.freeze(first),
    Object.freeze(second),
    Object.freeze(third),
  ]);
  const year = financialYear(records, "2026");
  assert.equal(year.spending, 18014398509481983n);
  assert.equal(year.categories.length, 2);
  assert.equal(year.categories[0].categoryId, "owned-food");
  assert.equal(year.categories[0].name, "Dining");
  assert.equal(year.categories[0].count, 2);
  assert.equal(year.categories[0].amount, 18014398509481982n);
  assert.equal(
    year.categories.reduce((total, category) => total + category.amount, 0n),
    year.spending,
  );
  assert.equal(
    year.confirmed.find(({ id }) => id === "first"),
    first,
  );
  assert.deepEqual(records, [first, second, third]);
});

test("year-to-date comparison matches calendar cutoffs, caps leap days and excludes future records", () => {
  const records = [
    record({ date: "2024-02-29", amount: 100 }),
    record({ date: "2024-03-01", amount: 999 }),
    record({ date: "2023-02-28", amount: 50 }),
    record({ date: "2023-03-01", amount: 888 }),
  ];
  const comparison = yearComparison(records, "2024", "2024-02-29");
  assert.equal(comparison.state, "available");
  assert.equal(comparison.current, 100n);
  assert.equal(comparison.previous, 50n);
  assert.equal(comparison.throughDate, "2024-02-29");
  assert.equal(financialSummaryModel(records, "2024", "2024-02-29").comparison.change, 50n);
  const complete = yearComparison(records, "2024", "2026-10-11");
  assert.equal(complete.current, 1099n);
  assert.equal(complete.previous, 938n);
  assert.equal(complete.throughDate, null);
});

test("year reports handle empty, future and boundary years without inventing a comparison", () => {
  assert.equal(yearComparison([], "2026").state, "no-baseline");
  assert.equal(yearComparison([], "2027").state, "future");
  assert.equal(yearComparison([], "0000").previousYear, null);
  assert.equal(financialYear([], "0000").months[1].days.length, 29);
  assert.equal(financialYear([], "9999").months[11].month, "9999-12");
  assert.equal(financialSummaryModel([], "9999").spending, 0n);
  assert.equal(financialSummaryModel([], "2026-10").label, "October 2026");
  for (const year of ["26", "2026-10", "10000", "-1", "2026 "])
    assert.throws(() => financialYear([], year), /valid calendar year/);
  assert.throws(() => yearComparison([], "2026", "2026-10-99"), /valid comparison date/);
});

test("daily and category aggregates remain exact beyond the safe-number total", () => {
  const result = financialMonth(
    [
      record({ id: "one", amount: Number.MAX_SAFE_INTEGER }),
      record({ id: "two", amount: Number.MAX_SAFE_INTEGER }),
      record({ id: "three", amount: 1, category: "Transport", date: "2026-10-12" }),
    ],
    "2026-10",
  );
  assert.equal(result.spending, 18014398509481983n);
  assert.equal(result.days[10].spending, 18014398509481982n);
  assert.equal(result.days[11].cumulativeSpending, 18014398509481983n);
  assert.equal(result.maxDailySpending, 18014398509481982n);
  assert.equal(result.categories[0].amount, 18014398509481982n);
  assert.equal(result.categories[1].amount, 1n);
  assert.ok(Number.isFinite(chartRatio(result.days[10].spending, result.spending)));
});

test("chart conversion clamps negative, zero, and oversized ratios without unsafe conversion", () => {
  assert.equal(chartRatio(0n, 0n), 0);
  assert.equal(chartRatio(-1n, 100n), 0);
  assert.equal(chartRatio(1n, -1n), 0);
  assert.equal(chartRatio(200n, 100n), 1);
  assert.equal(chartRatio(100n, 100n), 1);
  assert.equal(chartRatio(1n, 4n), 0.25);
  assert.equal(chartRatio(10n ** 400n, 4n * 10n ** 400n), 0.25);
});

test("calendar uses Monday columns, UTC dates, actual month lengths, and explicit future days", () => {
  const october = financialMonth([], "2026-10", "2026-10-11");
  assert.equal(october.calendarOffset, 3);
  assert.equal(october.days.length, 31);
  assert.equal(october.days[0].date, "2026-10-01");
  assert.equal(october.days[30].date, "2026-10-31");
  assert.equal(october.days[10].future, false);
  assert.equal(october.days[11].future, true);
  assert.equal(october.days[11].spending, 0n);
  assert.equal(october.days[11].transactions.length, 0);
  assert.equal(financialMonth([], "2024-02").days.length, 29);
  assert.equal(financialMonth([], "2026-02").days.length, 28);
  assert.equal(financialMonth([], "2026-06").calendarOffset, 0);
  assert.equal(financialMonth([], "2026-11").calendarOffset, 6);
});

test("future confirmed records remain real recorded values and absent dates stay empty", () => {
  const result = financialMonth(
    [record({ date: "2026-10-20", amount: 12345 })],
    "2026-10",
    "2026-10-11",
  );
  assert.equal(result.days[19].future, true);
  assert.equal(result.days[19].spending, 12345n);
  assert.equal(result.days[18].spending, 0n);
  assert.equal(result.days[20].cumulativeSpending, 12345n);
  assert.equal(result.spending, 12345n);
});

test("unassigned categories stay explicit and categories sort by exact amount then name", () => {
  const result = financialMonth(
    [
      record({ category: null, amount: 300 }),
      record({ category: "Transport", amount: 200 }),
      record({ category: "Food & Drinks", amount: 200 }),
    ],
    "2026-10",
  );
  assert.deepEqual(
    result.categories.map(({ name }) => name),
    ["Uncategorized", "Food & Drinks", "Transport"],
  );
  assert.equal(
    result.categories.reduce((total, category) => total + category.amount, 0n),
    result.spending,
  );
});

test("same-name owned categories keep separate totals, budgets, and transaction drilldowns", () => {
  const firstId = "00000000-0000-4000-8000-000000000201";
  const secondId = "00000000-0000-4000-8000-000000000202";
  const records = [
    record({ id: "first", categoryId: firstId, amount: 100 }),
    record({ id: "second", categoryId: secondId, amount: 300 }),
    record({ id: "first-again", categoryId: firstId, amount: 200 }),
    record({ id: "demo", amount: 50 }),
    record({ id: "pending", categoryId: firstId, amount: 999, status: "pending" }),
  ];
  const result = financialMonth(records, "2026-10");
  assert.equal(result.spending, 650n);
  assert.equal(result.categories.length, 3);
  const first = result.categories.find(({ categoryId }) => categoryId === firstId);
  const second = result.categories.find(({ categoryId }) => categoryId === secondId);
  const demo = result.categories.find(({ categoryId }) => categoryId === undefined);
  assert.deepEqual(first, { categoryId: firstId, name: "Food & Drinks", amount: 300n, count: 2 });
  assert.deepEqual(second, { categoryId: secondId, name: "Food & Drinks", amount: 300n, count: 1 });
  assert.deepEqual(demo, { name: "Food & Drinks", amount: 50n, count: 1 });
  assert.equal(categoryKey(first), firstId);
  assert.equal(categoryKey(demo), "Food & Drinks");
  const confirmed = result.days.flatMap(({ transactions }) => transactions);
  assert.deepEqual(
    confirmed.filter((item) => categoryContainsTransaction(first, item)).map(({ id }) => id),
    ["first", "first-again"],
  );
  assert.deepEqual(
    confirmed.filter((item) => categoryContainsTransaction(second, item)).map(({ id }) => id),
    ["second"],
  );
  assert.deepEqual(
    confirmed.filter((item) => categoryContainsTransaction(demo, item)).map(({ id }) => id),
    ["demo"],
  );
  assert.equal(
    categoryMatchesBudget(first, { categoryId: firstId, category: "Food & Drinks" }),
    true,
  );
  assert.equal(
    categoryMatchesBudget(first, { categoryId: secondId, category: "Food & Drinks" }),
    false,
  );
  assert.equal(categoryMatchesBudget(first, { category: "Food & Drinks" }), false);
  assert.equal(categoryMatchesBudget(demo, { category: "Food & Drinks" }), true);
});

test("renaming an owned category preserves its grouping, budget, and payments identity", () => {
  const categoryId = "00000000-0000-4000-8000-000000000201";
  const records = [
    record({ id: "renamed", categoryId, category: "Dining", amount: 120 }),
    record({ id: "old-label", categoryId, category: "Food & Drinks", amount: 80 }),
    record({ id: "different-category", category: "Dining", amount: 40 }),
  ];
  const result = financialMonth(records, "2026-10");
  const renamed = result.categories.find((category) => category.categoryId === categoryId);
  assert.deepEqual(renamed, { categoryId, name: "Dining", amount: 200n, count: 2 });
  assert.equal(categoryKey(renamed), categoryId);
  assert.equal(categoryMatchesBudget(renamed, { categoryId, category: "Food & Drinks" }), true);
  assert.equal(categoryMatchesBudget(renamed, { category: "Dining" }), false);
  assert.deepEqual(
    records.filter((item) => categoryContainsTransaction(renamed, item)).map(({ id }) => id),
    ["renamed", "old-label"],
  );
});

test("six-month cash flow crosses year boundaries and never manufactures previous-month data", () => {
  const records = [
    record({ date: "2025-09-01", amount: 5 }),
    record({ date: "2025-10-31", amount: 10 }),
    record({ date: "2026-01-01", kind: "income", amount: 100 }),
    record({ date: "2026-01-11", amount: 20 }),
    record({ date: "2026-01-12", status: "pending", amount: 999 }),
    record({ date: "2026-02-01", amount: 8 }),
  ];
  const periods = cashFlowMonths(records, "2026-01");
  assert.deepEqual(
    periods.map(({ month }) => month),
    ["2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01"],
  );
  assert.deepEqual(periods[4], {
    month: "2025-12",
    income: 0n,
    spending: 0n,
    difference: 0n,
    confirmedCount: 0,
  });
  assert.equal(periods[5].income, 100n);
  assert.equal(periods[5].spending, 20n);
  assert.equal(periods[5].difference, 80n);
  assert.equal(periods[5].confirmedCount, 2);
});

test("six-month reports preserve exact periods at both calendar boundaries", () => {
  assert.deepEqual(
    cashFlowMonths([], "0000-06").map(({ month }) => month),
    ["0000-01", "0000-02", "0000-03", "0000-04", "0000-05", "0000-06"],
  );
  assert.deepEqual(
    cashFlowMonths([], "9999-12").map(({ month }) => month),
    ["9999-07", "9999-08", "9999-09", "9999-10", "9999-11", "9999-12"],
  );
  // Early months remain valid historical periods, but cannot anchor six-month reports.
  for (const month of ["0000-01", "0000-02", "0000-03", "0000-04", "0000-05"]) {
    assert.equal(financialMonth([], month).month, month);
    assert.throws(() => cashFlowMonths([], month), /five earlier months/);
  }
  assert.equal(monthComparison([], "0000-06").previousMonth, "0000-05");
  assert.equal(monthComparison([], "9999-12").previousMonth, "9999-11");
  assert.throws(() => monthComparison([], "0000-01"), /supported calendar range/);
});

test("malformed month input fails explicitly rather than producing an invalid visualization", () => {
  for (const month of ["", "2026-1", "2026-00", "2026-13", "2026-10-01", "today"]) {
    assert.throws(() => financialMonth([], month), /valid calendar month/);
    assert.throws(() => cashFlowMonths([], month), /valid calendar month/);
  }
});

test("month comparison uses confirmed expenses through the same day and excludes future entries", () => {
  const comparison = monthComparison(
    [
      record({ date: "2026-10-01", amount: 30 }),
      record({ date: "2026-10-11", amount: 20 }),
      record({ date: "2026-10-12", amount: 900 }),
      record({ date: "2026-09-11", amount: 40 }),
      record({ date: "2026-09-12", amount: 800 }),
      record({ date: "2026-09-11", amount: 999, status: "pending" }),
      record({ date: "2026-09-11", amount: 999, status: "rejected" }),
      record({ date: "2026-09-11", amount: 999, kind: "income" }),
      record({ date: "2026-09-11", amount: 999, kind: "transfer", method: "BCA → Jago" }),
    ],
    "2026-10",
    "2026-10-11",
  );
  assert.deepEqual(comparison, {
    state: "available",
    previousMonth: "2026-09",
    throughDay: 11,
    current: 50n,
    previous: 40n,
  });
});

test("historical comparisons use both full months rather than today's day number", () => {
  const comparison = monthComparison(
    [record({ date: "2026-08-31", amount: 5 }), record({ date: "2026-09-30", amount: 9 })],
    "2026-09",
    "2026-10-11",
  );
  assert.equal(comparison.state, "available");
  assert.equal(comparison.throughDay, null);
  assert.equal(comparison.current, 9n);
  assert.equal(comparison.previous, 5n);
});

test("same-day comparison caps February at its last actual day across leap years", () => {
  for (const [year, februaryEnd] of [
    ["2024", "29"],
    ["2026", "28"],
  ]) {
    const comparison = monthComparison(
      [
        record({ date: `${year}-02-${februaryEnd}`, amount: 7 }),
        record({ date: `${year}-03-31`, amount: 9 }),
      ],
      `${year}-03`,
      `${year}-03-31`,
    );
    assert.equal(comparison.state, "available");
    assert.equal(comparison.throughDay, 31);
    assert.equal(comparison.previous, 7n);
    assert.equal(comparison.current, 9n);
  }
});

test("comparison distinguishes absent prior expenses from an available baseline", () => {
  const comparison = monthComparison(
    [
      record({ amount: 50 }),
      record({ date: "2026-09-12", amount: 100 }),
      record({ date: "2026-09-11", amount: 100, kind: "income" }),
      record({ date: "2026-09-11", amount: 100, status: "pending" }),
    ],
    "2026-10",
    "2026-10-11",
  );
  assert.equal(comparison.state, "no-baseline");
  assert.equal(comparison.previous, 0n);
  assert.equal(comparison.current, 50n);
  assert.equal(monthComparison([], "2026-10").state, "no-baseline");
});

test("future selected months retain recorded totals without presenting a completed comparison", () => {
  const comparison = monthComparison(
    [record({ date: "2026-10-11", amount: 40 }), record({ date: "2026-11-01", amount: 25 })],
    "2026-11",
    "2026-10-11",
  );
  assert.equal(comparison.state, "future");
  assert.equal(comparison.throughDay, null);
  assert.equal(comparison.current, 25n);
  assert.equal(comparison.previous, 40n);
});

test("month comparison stays exact when both month totals exceed safe-number precision", () => {
  const comparison = monthComparison(
    [
      record({ amount: Number.MAX_SAFE_INTEGER }),
      record({ amount: Number.MAX_SAFE_INTEGER }),
      record({ date: "2026-09-11", amount: Number.MAX_SAFE_INTEGER }),
      record({ date: "2026-09-11", amount: Number.MAX_SAFE_INTEGER - 1 }),
    ],
    "2026-10",
  );
  assert.equal(comparison.current, 18014398509481982n);
  assert.equal(comparison.previous, 18014398509481981n);
  assert.equal(comparison.current - comparison.previous, 1n);
});

test("invalid comparison dates fail explicitly before indexing daily totals", () => {
  for (const today of ["", "2026-02-29", "2026-10-32", "2026-10", "today"]) {
    assert.throws(() => monthComparison([], "2026-10", today), /valid comparison date/);
  }
});

test("compact monetary labels preserve signs and bigint magnitude without unsafe conversion", () => {
  assert.equal(compactAmount(999n), "Rp999");
  assert.equal(compactAmount(1000n), "Rp1k");
  assert.equal(compactAmount(1999n), "Rp1.9k");
  assert.equal(compactAmount(-397490n), "-Rp397.4k");
  assert.equal(compactAmount(397490n, false), "Rp397k");
  assert.equal(compactAmount(18014398509481983n), "Rp18014.3t");
  assert.equal(compactAmount(10n ** 400n), `Rp1${"0".repeat(388)}t`);
});
