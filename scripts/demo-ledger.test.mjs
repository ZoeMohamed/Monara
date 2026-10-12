import assert from "node:assert/strict";
import test from "node:test";
import {
  budgetUsage,
  daysInMonth,
  demoReminders,
  demoSummary,
  formatMonth,
  isCalendarDate,
  newestFirst,
  rejectPendingTransaction,
  reviewFlags,
  safeToSpendToday,
  shiftMonth,
  transactionErrors,
  updatePendingTransaction,
} from "../apps/web/src/data/demo-ledger.ts";

function syntheticTransaction(overrides = {}) {
  return {
    id: "synthetic-pending",
    merchant: "Synthetic merchant",
    category: "Food & Drinks",
    amount: 28000,
    currency: "IDR",
    date: "2026-10-11",
    time: "08:15",
    method: "BCA",
    kind: "expense",
    emoji: "✦",
    confidence: 94,
    status: "pending",
    ...overrides,
  };
}

function valuesOf(transaction) {
  const { merchant, category, amount, currency, date, time, method, kind } = transaction;
  return { merchant, category, amount, currency, date, time, method, kind };
}

test("calendar validation accepts leap days and rejects normalized or malformed dates", () => {
  for (const date of ["2024-02-29", "2000-02-29", "2026-02-28", "2026-12-31"]) {
    assert.equal(isCalendarDate(date), true, date);
  }
  for (const date of [
    null,
    "",
    "2026-02-29",
    "1900-02-29",
    "2026-04-31",
    "2026-00-10",
    "2026-13-10",
    "2026-10-00",
    "2026-10-32",
    "2026-1-01",
    "2026-10-11T08:15:00Z",
    " 2026-10-11",
    "Today",
  ]) {
    assert.equal(isCalendarDate(date), false, String(date));
  }
});

test("missing extracted values stay null and cannot be silently confirmed", () => {
  const uncertain = syntheticTransaction({
    merchant: null,
    category: null,
    amount: null,
    currency: null,
    date: null,
    time: null,
    method: null,
    kind: null,
    confidence: null,
  });
  const original = Object.freeze([Object.freeze(uncertain)]);
  const values = valuesOf(uncertain);
  const errors = transactionErrors(values);
  assert.deepEqual(Object.keys(errors).sort(), ["amount", "currency", "date", "kind"]);
  assert.equal(updatePendingTransaction(original, uncertain.id, values, "confirm"), original);
  const edited = updatePendingTransaction(original, uncertain.id, values, "edit");
  assert.deepEqual(edited, original);
  assert.ok(reviewFlags(edited[0]).includes("Confidence unavailable"));
  assert.equal(demoSummary(edited).spending, 0n);
});

test("optional unknown fields remain unassigned when required values are confirmed", () => {
  const pending = syntheticTransaction({
    merchant: null,
    category: null,
    method: null,
    time: null,
  });
  const values = valuesOf(pending);
  assert.deepEqual(transactionErrors(values), {});
  const confirmed = updatePendingTransaction([pending], pending.id, values, "confirm");
  assert.equal(confirmed[0].status, "confirmed");
  assert.equal(confirmed[0].merchant, null);
  assert.equal(confirmed[0].category, null);
  assert.equal(confirmed[0].method, null);
  assert.equal(confirmed[0].time, null);
  assert.equal(demoSummary(confirmed).spending, 28000n);
});

test("amount validation rejects nonfinite, nonpositive, fractional, and unsafe rupiah", () => {
  for (const amount of [
    null,
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    0.5,
    28000.25,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    const pending = syntheticTransaction({ amount });
    const original = [pending];
    assert.ok(transactionErrors(valuesOf(pending)).amount, String(amount));
    assert.equal(
      updatePendingTransaction(original, pending.id, valuesOf(pending), "confirm"),
      original,
    );
    assert.equal(demoSummary([syntheticTransaction({ amount, status: "confirmed" })]).spending, 0n);
  }
  for (const amount of [1, 28000]) {
    assert.equal(transactionErrors(valuesOf(syntheticTransaction({ amount }))).amount, undefined);
  }
});

test("invalid type, unsupported currency, and impossible date each prevent confirmation", () => {
  for (const override of [{ kind: "payment" }, { currency: "USD" }, { date: "2026-02-30" }]) {
    const pending = syntheticTransaction(override);
    const original = [pending];
    assert.ok(Object.keys(transactionErrors(valuesOf(pending))).length > 0);
    assert.equal(
      updatePendingTransaction(original, pending.id, valuesOf(pending), "confirm"),
      original,
    );
  }
});

test("a transfer cannot confirm with missing, single, same, or unknown Financial Accounts", () => {
  for (const method of [null, "", "BCA", "Jago", "BCA → BCA", "BCA → Unknown", "Unknown → BCA"]) {
    const pending = syntheticTransaction({ kind: "transfer", method });
    const original = [pending];
    assert.ok(transactionErrors(valuesOf(pending)).method, String(method));
    assert.ok(reviewFlags(pending).includes("Transfer accounts missing or invalid"));
    assert.equal(
      updatePendingTransaction(original, pending.id, valuesOf(pending), "confirm"),
      original,
    );
    assert.equal(pending.status, "pending");
    assert.equal(pending.method, method);
  }
  for (const kind of ["expense", "income"]) {
    assert.deepEqual(transactionErrors(valuesOf(syntheticTransaction({ kind, method: null }))), {});
  }
});

test("changing expense to transfer requires deliberately selecting a valid source and destination", () => {
  for (const method of ["BCA → Jago", "Jago → BCA"]) {
    const expense = syntheticTransaction();
    const transferValues = { ...valuesOf(expense), kind: "transfer" };
    const edited = updatePendingTransaction([expense], expense.id, transferValues, "edit");
    assert.equal(edited[0].kind, "transfer");
    assert.equal(edited[0].method, "BCA");
    assert.equal(edited[0].status, "pending");
    assert.ok(transactionErrors(valuesOf(edited[0])).method);
    assert.equal(
      updatePendingTransaction(edited, expense.id, valuesOf(edited[0]), "confirm"),
      edited,
    );
    const selected = { ...valuesOf(edited[0]), method };
    assert.deepEqual(transactionErrors(selected), {});
    const confirmed = updatePendingTransaction(edited, expense.id, selected, "confirm");
    assert.equal(confirmed[0].status, "confirmed");
    assert.equal(confirmed[0].method, method);
    const summary = demoSummary(confirmed);
    assert.equal(summary.spending, 0n);
    assert.equal(summary.income, 0n);
    assert.equal(summary.confirmed.length, 1);
  }
});

test("editing changes only the selected pending item and preserves its review state", () => {
  const pending = Object.freeze(syntheticTransaction());
  const other = Object.freeze(syntheticTransaction({ id: "synthetic-other", amount: 67000 }));
  const original = Object.freeze([pending, other]);
  const edits = { ...valuesOf(pending), merchant: "Corrected synthetic merchant", amount: 31000 };
  const edited = updatePendingTransaction(original, pending.id, edits, "edit");
  assert.equal(edited[0].merchant, "Corrected synthetic merchant");
  assert.equal(edited[0].amount, 31000);
  assert.equal(edited[0].status, "pending");
  assert.equal(edited[0].confidence, 94);
  assert.equal(edited[0].id, pending.id);
  assert.equal(edited[1], other);
  assert.equal(pending.amount, 28000);
  assert.equal(demoSummary(edited).spending, 0n);
});

test("an incomplete edit stays pending until required fields are deliberately supplied", () => {
  const pending = syntheticTransaction();
  const missing = { ...valuesOf(pending), amount: null, date: null };
  const edited = updatePendingTransaction([pending], pending.id, missing, "edit");
  assert.equal(edited[0].status, "pending");
  assert.equal(edited[0].amount, null);
  assert.equal(edited[0].date, null);
  assert.equal(
    updatePendingTransaction(edited, pending.id, valuesOf(edited[0]), "confirm"),
    edited,
  );
  const confirmed = updatePendingTransaction(edited, pending.id, valuesOf(pending), "confirm");
  assert.equal(confirmed[0].status, "confirmed");
  assert.equal(demoSummary(confirmed).spending, 28000n);
});

test("confirmation updates exact totals once and repeated actions cannot change a confirmed record", () => {
  const existing = syntheticTransaction({
    id: "synthetic-confirmed",
    amount: 397490,
    status: "confirmed",
  });
  const pending = syntheticTransaction();
  const original = [existing, pending];
  assert.equal(demoSummary(original).spending, 397490n);
  const confirmed = updatePendingTransaction(original, pending.id, valuesOf(pending), "confirm");
  assert.equal(confirmed[1].status, "confirmed");
  assert.equal(demoSummary(confirmed).spending, 425490n);
  const changedValues = { ...valuesOf(pending), amount: 1 };
  for (const action of ["confirm", "edit"]) {
    assert.deepEqual(
      updatePendingTransaction(confirmed, pending.id, changedValues, action),
      confirmed,
    );
  }
  assert.deepEqual(rejectPendingTransaction(confirmed, pending.id), confirmed);
  assert.equal(original[1].status, "pending");
});

test("rejection retains the record but excludes it and cannot be reversed by edit or confirmation", () => {
  const pending = Object.freeze(syntheticTransaction());
  const original = Object.freeze([pending]);
  const rejected = rejectPendingTransaction(original, pending.id);
  assert.equal(rejected.length, 1);
  assert.deepEqual(rejected[0], { ...pending, status: "rejected" });
  assert.equal(pending.status, "pending");
  assert.equal(demoSummary(rejected).confirmed.length, 0);
  assert.equal(demoSummary(rejected).spending, 0n);
  assert.deepEqual(rejectPendingTransaction(rejected, pending.id), rejected);
  for (const action of ["edit", "confirm"]) {
    assert.deepEqual(
      updatePendingTransaction(rejected, pending.id, valuesOf(pending), action),
      rejected,
    );
  }
});

test("unknown identifiers leave every record unchanged", () => {
  const records = [
    syntheticTransaction(),
    syntheticTransaction({ id: "synthetic-existing", status: "confirmed" }),
  ];
  assert.deepEqual(rejectPendingTransaction(records, "synthetic-missing"), records);
  for (const action of ["edit", "confirm"]) {
    assert.deepEqual(
      updatePendingTransaction(records, "synthetic-missing", valuesOf(records[0]), action),
      records,
    );
  }
});

test("totals include only valid confirmed expenses and income, excluding transfers and unresolved imports", () => {
  const records = [
    syntheticTransaction({ id: "expense", status: "confirmed", amount: 67000 }),
    syntheticTransaction({ id: "income", status: "confirmed", kind: "income", amount: 200000 }),
    syntheticTransaction({
      id: "transfer",
      status: "confirmed",
      kind: "transfer",
      method: "BCA → Jago",
      amount: 900000,
    }),
    syntheticTransaction({ id: "pending-expense", amount: 880000 }),
    syntheticTransaction({ id: "pending-income", kind: "income", amount: 990000 }),
    syntheticTransaction({ id: "rejected-expense", status: "rejected", amount: 770000 }),
    syntheticTransaction({
      id: "rejected-income",
      status: "rejected",
      kind: "income",
      amount: 660000,
    }),
    syntheticTransaction({
      id: "invalid-confirmed",
      status: "confirmed",
      date: null,
      amount: 550000,
    }),
  ];
  const summary = demoSummary(records);
  assert.equal(summary.spending, 67000n);
  assert.equal(summary.income, 200000n);
  assert.equal(summary.difference, 133000n);
  assert.deepEqual(
    summary.confirmed.map(({ id }) => id),
    ["expense", "income", "transfer"],
  );
});

test("aggregates stay exact when individually valid rupiah amounts exceed the safe-number sum", () => {
  const records = [
    syntheticTransaction({
      id: "large-expense-one",
      status: "confirmed",
      amount: Number.MAX_SAFE_INTEGER,
    }),
    syntheticTransaction({
      id: "large-expense-two",
      status: "confirmed",
      amount: Number.MAX_SAFE_INTEGER,
    }),
    syntheticTransaction({ id: "small-expense", status: "confirmed", amount: 1 }),
    syntheticTransaction({
      id: "large-income",
      status: "confirmed",
      kind: "income",
      amount: Number.MAX_SAFE_INTEGER,
    }),
  ];
  const summary = demoSummary(records);
  assert.equal(summary.spending, 18014398509481983n);
  assert.equal(summary.income, 9007199254740991n);
  assert.equal(summary.difference, -9007199254740992n);
});

test("monthly summaries include both month boundaries and nothing outside the month", () => {
  const records = [
    syntheticTransaction({ id: "before", status: "confirmed", date: "2026-09-30", amount: 1 }),
    syntheticTransaction({ id: "first", status: "confirmed", date: "2026-10-01", amount: 2 }),
    syntheticTransaction({ id: "last", status: "confirmed", date: "2026-10-31", amount: 4 }),
    syntheticTransaction({ id: "after", status: "confirmed", date: "2026-11-01", amount: 8 }),
  ];
  const october = demoSummary(records);
  assert.equal(october.spending, 6n);
  assert.deepEqual(
    october.confirmed.map(({ id }) => id),
    ["first", "last"],
  );
  assert.equal(demoSummary(records, "2026-09").spending, 1n);
  assert.equal(demoSummary(records, "2026-11").spending, 8n);
  assert.equal(demoSummary(records, "2026-08").spending, 0n);
});

test("month helpers cross year boundaries and know month lengths", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-10", -12), "2025-10");
  assert.equal(daysInMonth("2024-02"), 29);
  assert.equal(daysInMonth("2026-02"), 28);
  assert.equal(daysInMonth("2026-10"), 31);
  assert.equal(formatMonth("2026-10"), "October 2026");
});

const syntheticBudget = {
  id: "synthetic-budget",
  category: "Food & Drinks",
  emoji: "✦",
  cadence: "monthly",
  limit: 100000,
  warningPercent: 80,
};

test("budget usage counts only confirmed expenses of that category in that month", () => {
  const records = [
    syntheticTransaction({ id: "counted", status: "confirmed", amount: 50000 }),
    syntheticTransaction({ id: "pending", amount: 40000 }),
    syntheticTransaction({ id: "other", status: "confirmed", category: "Transport", amount: 9 }),
    syntheticTransaction({ id: "income", status: "confirmed", kind: "income", amount: 9 }),
    syntheticTransaction({
      id: "moved",
      status: "confirmed",
      kind: "transfer",
      amount: 9,
      method: "BCA → Jago",
    }),
    syntheticTransaction({ id: "last-month", status: "confirmed", date: "2026-09-30", amount: 9 }),
  ];
  const usage = budgetUsage(records, syntheticBudget);
  assert.equal(usage.used, 50000n);
  assert.equal(usage.remaining, 50000n);
  assert.equal(usage.percent, 50);
  assert.equal(usage.state, "on-track");
});

test("budget state crosses the warning threshold at exactly 80% and over at exactly 100%", () => {
  const at = (amount) =>
    budgetUsage([syntheticTransaction({ status: "confirmed", amount })], syntheticBudget).state;
  assert.equal(at(79999), "on-track");
  assert.equal(at(80000), "warning");
  assert.equal(at(99999), "warning");
  assert.equal(at(100000), "over");
  assert.equal(at(150000), "over");
});

test("overall safe-to-spend subtracts cross-category overspending before dividing by days left", () => {
  const transport = { ...syntheticBudget, id: "transport", category: "Transport", limit: 50000 };
  const records = [
    syntheticTransaction({ status: "confirmed", amount: 37000 }),
    syntheticTransaction({ status: "confirmed", category: "Transport", amount: 90000 }),
  ];
  const result = safeToSpendToday(records, [syntheticBudget, transport], "2026-10-11");
  assert.equal(result.daysLeft, 21);
  assert.equal(result.limit, 150000n);
  assert.equal(result.spending, 127000n);
  assert.equal(result.rawRemaining, 23000n);
  assert.equal(result.remaining, 23000n);
  assert.equal(result.shortfall, 0n);
  assert.equal(result.perDay, 1095n);
  assert.equal(result.perCategory[0].remaining, 63000n);
  assert.equal(result.perCategory[0].perDay, 3000n);
  assert.equal(result.perCategory[1].remaining, -40000n);
  assert.equal(result.perCategory[1].available, 0n);
  assert.equal(result.perCategory[1].perDay, 0n);
});

test("uncategorized expenses and expenses without a budget reduce the overall safe amount", () => {
  const records = [
    syntheticTransaction({ status: "confirmed", category: null, amount: 15000 }),
    syntheticTransaction({ status: "confirmed", category: "Other", amount: 25000 }),
  ];
  const result = safeToSpendToday(records, [syntheticBudget], "2026-10-11");
  assert.equal(result.spending, 40000n);
  assert.equal(result.remaining, 60000n);
  assert.equal(result.perDay, 2857n);
  assert.equal(result.perCategory[0].used, 0n);
  assert.equal(result.perCategory[0].available, 100000n);
  assert.equal(result.perCategory[0].perDay, 4761n);
});

test("an exhausted overall budget recommends zero and retains the actual shortfall", () => {
  const records = [syntheticTransaction({ status: "confirmed", amount: 150000 })];
  const result = safeToSpendToday(records, [syntheticBudget], "2026-10-11");
  assert.equal(result.rawRemaining, -50000n);
  assert.equal(result.shortfall, 50000n);
  assert.equal(result.remaining, 0n);
  assert.equal(result.perDay, 0n);
  assert.equal(result.perCategory[0].remaining, -50000n);
  assert.equal(result.perCategory[0].perDay, 0n);
  const atLimit = safeToSpendToday(
    [syntheticTransaction({ status: "confirmed", amount: 100000 })],
    [syntheticBudget],
  );
  assert.equal(atLimit.remaining, 0n);
  assert.equal(atLimit.shortfall, 0n);
  assert.equal(atLimit.perDay, 0n);
});

test("safe-to-spend counts the final calendar day and makes all remaining budget available", () => {
  const result = safeToSpendToday(
    [syntheticTransaction({ status: "confirmed", amount: 37000 })],
    [syntheticBudget],
    "2026-10-31",
  );
  assert.equal(result.daysLeft, 1);
  assert.equal(result.remaining, 63000n);
  assert.equal(result.perDay, 63000n);
  assert.equal(result.perCategory[0].perDay, 63000n);
  const leapDay = safeToSpendToday([], [syntheticBudget], "2024-02-29");
  assert.equal(leapDay.daysLeft, 1);
  assert.equal(leapDay.perDay, 100000n);
});

test("safe-to-spend excludes pending, rejected, income, transfers and expenses outside this month", () => {
  const records = [
    syntheticTransaction({ status: "confirmed", amount: 1200 }),
    syntheticTransaction({ amount: 99000 }),
    syntheticTransaction({ status: "rejected", amount: 99000 }),
    syntheticTransaction({ status: "confirmed", kind: "income", amount: 99000 }),
    syntheticTransaction({
      status: "confirmed",
      kind: "transfer",
      method: "BCA → Jago",
      amount: 99000,
    }),
    syntheticTransaction({ status: "confirmed", date: "2026-09-30", amount: 99000 }),
  ];
  const result = safeToSpendToday(records, [syntheticBudget], "2026-10-11");
  assert.equal(result.spending, 1200n);
  assert.equal(result.remaining, 98800n);
  assert.equal(result.perDay, 4704n);
  assert.equal(result.perCategory[0].used, 1200n);
});

test("safe-to-spend aggregates individually safe budget limits without losing exact rupiah", () => {
  const budgets = [
    { ...syntheticBudget, id: "food", limit: Number.MAX_SAFE_INTEGER },
    {
      ...syntheticBudget,
      id: "transport",
      category: "Transport",
      limit: Number.MAX_SAFE_INTEGER,
    },
    { ...syntheticBudget, id: "other", category: "Other", limit: 1 },
  ];
  const result = safeToSpendToday(
    [syntheticTransaction({ status: "confirmed", amount: 1 })],
    budgets,
    "2026-10-31",
  );
  assert.equal(result.limit, 18014398509481983n);
  assert.equal(result.spending, 1n);
  assert.equal(result.remaining, 18014398509481982n);
  assert.equal(result.perDay, 18014398509481982n);
  assert.equal(result.perCategory[0].remaining, 9007199254740990n);
  assert.equal(result.perCategory[1].remaining, 9007199254740991n);
});

test("reminder previews use threshold IDs and include active bills 3 days ahead or due today", () => {
  const bill = (overrides) => ({
    id: "bill",
    merchant: "Synthetic bill",
    emoji: "✦",
    expectedAmount: 100000,
    cadence: "monthly",
    nextDue: "2026-10-14",
    cancellationUrl: null,
    status: "active",
    ...overrides,
  });
  const bills = [
    bill({ id: "in-three-days" }),
    bill({ id: "today", nextDue: "2026-10-11" }),
    bill({ id: "in-two-days", nextDue: "2026-10-13" }),
    bill({ id: "suggested", status: "suggested" }),
  ];
  const warning = [syntheticTransaction({ status: "confirmed", amount: 85000 })];
  const reminders = demoReminders(warning, [syntheticBudget], bills, "2026-10-11");
  assert.deepEqual(
    reminders.map(({ id }) => id),
    [
      "budget:synthetic-budget:2026-10:80",
      "bill:in-three-days:2026-10-14:3",
      "bill:today:2026-10-11:0",
    ],
  );
  assert.match(reminders[0].message, /used 85% of your Food & Drinks budget/);
  assert.match(reminders[0].message, /is left until Oct 31\./);

  const over = [syntheticTransaction({ status: "confirmed", amount: 120000 })];
  const [overReminder] = demoReminders(over, [syntheticBudget], [], "2026-10-11");
  assert.equal(overReminder.id, "budget:synthetic-budget:2026-10:100");
  assert.match(overReminder.message, /Rp\s?0 is left/);

  const pendingOnly = [syntheticTransaction({ amount: 120000 })];
  assert.deepEqual(demoReminders(pendingOnly, [syntheticBudget], [], "2026-10-11"), []);
});

test("a zero budget limit reports 0% when unused and over budget when spent, without throwing", () => {
  const zero = { ...syntheticBudget, limit: 0 };
  assert.equal(budgetUsage([], zero).percent, 0);
  const spent = budgetUsage([syntheticTransaction({ status: "confirmed", amount: 1 })], zero);
  assert.equal(spent.percent, 100);
  assert.equal(spent.state, "over");
});

test("a transfer missing its accounts gets one flag, not two", () => {
  const flags = reviewFlags(syntheticTransaction({ kind: "transfer", method: null }));
  assert.ok(flags.includes("Transfer accounts missing or invalid"));
  assert.ok(!flags.includes("Financial account not assigned"));
  assert.ok(
    reviewFlags(syntheticTransaction({ method: null })).includes("Financial account not assigned"),
  );
});

test("newest-first ordering uses date then time and puts undated records last", () => {
  const records = [
    syntheticTransaction({ id: "older", date: "2026-10-01", time: "23:00" }),
    syntheticTransaction({ id: "undated", date: null, time: null }),
    syntheticTransaction({ id: "newest", date: "2026-10-11", time: "09:42" }),
    syntheticTransaction({ id: "earlier-today", date: "2026-10-11", time: "08:15" }),
  ];
  assert.deepEqual(
    [...records].sort(newestFirst).map(({ id }) => id),
    ["newest", "earlier-today", "older", "undated"],
  );
});

test("high extraction confidence never promotes a pending import into confirmed totals", () => {
  const pending = syntheticTransaction({ confidence: 100 });
  assert.deepEqual(transactionErrors(valuesOf(pending)), {});
  assert.ok(!reviewFlags(pending).includes("Low confidence"));
  assert.equal(pending.status, "pending");
  assert.equal(demoSummary([pending]).spending, 0n);
  const confirmed = updatePendingTransaction([pending], pending.id, valuesOf(pending), "confirm");
  assert.equal(confirmed[0].status, "confirmed");
  assert.equal(demoSummary(confirmed).spending, 28000n);
});
