import assert from "node:assert/strict";
import test from "node:test";
import {
  budgetUsage,
  daysInMonth,
  deleteConfirmedTransaction,
  demoReminders,
  demoSummary,
  excludePendingTransaction,
  formatMonth,
  isCalendarDate,
  newestFirst,
  safeToSpendToday,
  shiftMonth,
  transactionErrors,
  undoTransactionDeletion,
  undoTransactionUpdate,
  updateConfirmedTransaction,
  updatePendingTransaction,
} from "../apps/web/src/data/demo-ledger.ts";
import { exclusionCategoryPresets } from "../packages/contracts/src/category-presets.ts";

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
  for (const date of ["0000-02-29", "2024-02-29", "2000-02-29", "2026-02-28", "2026-12-31"]) {
    assert.equal(isCalendarDate(date), true, date);
  }
  for (const date of [
    null,
    "",
    "2026-02-29",
    "1900-02-29",
    "0100-02-29",
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

test("an imported transaction can be reviewed before an Account is assigned", () => {
  for (const kind of ["expense", "income"]) {
    const pending = syntheticTransaction({ kind, method: null });
    assert.deepEqual(transactionErrors(valuesOf(pending)), {});
  }
});

test("an undated import stays pending when excluded without inventing a date", () => {
  const incomplete = syntheticTransaction({
    amount: null,
    currency: null,
    date: null,
    method: null,
  });
  const [excluded] = excludePendingTransaction([incomplete], incomplete.id);
  assert.equal(excluded.kind, incomplete.kind);
  assert.equal(excluded.status, "pending");
  assert.ok(transactionErrors({ ...excluded, kind: "exclusion" }).date);
  assert.equal(excluded.date, null);
  assert.equal(demoSummary([excluded]).spending, 0n);
});

test("exclusion categories are optional and display names do not determine their type", () => {
  for (const category of [null, "Groceries", ...exclusionCategoryPresets.map(({ name }) => name)]) {
    const item = syntheticTransaction({ kind: "exclusion", category, categoryKind: "exclusion" });
    assert.deepEqual(transactionErrors(item), {});
    const confirmed = updatePendingTransaction([item], item.id, valuesOf(item), "confirm");
    assert.equal(confirmed[0].amount, item.amount);
    assert.equal(confirmed[0].status, "confirmed");
    assert.equal(demoSummary(confirmed).spending, 0n);
    assert.equal(demoSummary(confirmed).income, 0n);
  }
});

test("unknown pending types retain category hints without guessing financial treatment", () => {
  const pending = syntheticTransaction({ kind: null, category: "Salary", categoryKind: "income" });
  assert.equal(transactionErrors(pending).category, undefined);
  assert.equal(transactionErrors(pending).kind, "Choose the transaction type.");
  const edited = updatePendingTransaction(
    [pending],
    pending.id,
    { ...pending, merchant: "Corrected evidence" },
    "edit",
  );
  assert.equal(edited[0].kind, null);
  assert.equal(edited[0].category, "Salary");
  assert.equal(edited[0].categoryKind, "income");
  assert.equal(edited[0].status, "pending");
  assert.equal(demoSummary(edited).income, 0n);
  assert.equal(demoSummary(edited).spending, 0n);
  assert.ok(transactionErrors({ ...edited[0], kind: "expense" }).category);
});

test("expense and income cannot use a category typed as exclusion", () => {
  for (const kind of ["expense", "income"]) {
    assert.ok(
      transactionErrors(
        syntheticTransaction({ kind, category: "Internal", categoryKind: "exclusion" }),
      ).category,
    );
  }
  assert.equal(
    transactionErrors(syntheticTransaction({ category: "Internal", categoryKind: "expense" }))
      .category,
    undefined,
  );
});

test("the removed transfer direction cannot be edited or confirmed", () => {
  const expense = syntheticTransaction();
  const transferValues = { ...valuesOf(expense), kind: "transfer" };
  assert.equal(transactionErrors(transferValues).kind, "Choose the transaction type.");
  const edited = updatePendingTransaction([expense], expense.id, transferValues, "edit");
  assert.equal(edited[0].kind, "transfer");
  assert.equal(edited[0].status, "pending");
  assert.equal(updatePendingTransaction(edited, expense.id, transferValues, "confirm"), edited);
  assert.equal(demoSummary(edited).confirmed.length, 0);
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
  assert.deepEqual(excludePendingTransaction(confirmed, pending.id), confirmed);
  assert.equal(original[1].status, "pending");
});

test("exclusion retains the record as confirmed and cannot be reviewed twice", () => {
  const pending = Object.freeze(syntheticTransaction());
  const original = Object.freeze([pending]);
  const rejected = excludePendingTransaction(original, pending.id);
  assert.equal(rejected.length, 1);
  assert.deepEqual(rejected[0], {
    ...pending,
    kind: "exclusion",
    status: "confirmed",
    category: null,
    categoryId: null,
    categoryKind: undefined,
    categoryIcon: undefined,
  });
  assert.equal(pending.status, "pending");
  assert.equal(demoSummary(rejected).confirmed.length, 0);
  assert.equal(demoSummary(rejected).spending, 0n);
  assert.deepEqual(excludePendingTransaction(rejected, pending.id), rejected);
  for (const action of ["edit", "confirm"]) {
    assert.deepEqual(
      updatePendingTransaction(rejected, pending.id, valuesOf(pending), action),
      rejected,
    );
  }
});

test("a correction updates exact totals once while preserving identity and unrelated records", () => {
  const confirmed = Object.freeze(syntheticTransaction({ status: "confirmed" }));
  const other = Object.freeze(
    syntheticTransaction({ id: "other", status: "confirmed", amount: 67000 }),
  );
  const original = Object.freeze([confirmed, other]);
  const correctedValues = {
    ...valuesOf(confirmed),
    merchant: "Corrected merchant",
    amount: 31000,
    time: "09:30",
    method: "Jago",
  };
  const corrected = updateConfirmedTransaction(original, confirmed.id, correctedValues);
  assert.equal(demoSummary(original).spending, 95000n);
  assert.equal(demoSummary(corrected).spending, 98000n);
  assert.equal(corrected.length, original.length);
  assert.deepEqual(corrected[0], { ...confirmed, ...correctedValues });
  assert.equal(corrected[1], other);
  assert.equal(confirmed.amount, 28000);
  const repeated = updateConfirmedTransaction(corrected, confirmed.id, correctedValues);
  assert.equal(demoSummary(repeated).spending, 98000n);
  assert.equal(repeated.length, 2);
});

test("correcting month and category moves the expense between the affected summaries and budgets", () => {
  const confirmed = syntheticTransaction({ status: "confirmed" });
  const food = {
    id: "food",
    category: "Food & Drinks",
    limit: 100000,
    warningPercent: 80,
    cadence: "monthly",
    emoji: "✦",
  };
  const transport = { ...food, id: "transport", category: "Transport" };
  const corrected = updateConfirmedTransaction([confirmed], confirmed.id, {
    ...valuesOf(confirmed),
    category: "Transport",
    date: "2026-09-30",
  });
  assert.equal(demoSummary(corrected, "2026-10").spending, 0n);
  assert.equal(demoSummary(corrected, "2026-09").spending, 28000n);
  assert.equal(budgetUsage(corrected, food, "2026-10").used, 0n);
  assert.equal(budgetUsage(corrected, transport, "2026-09").used, 28000n);
  assert.equal(budgetUsage(corrected, food, "2026-09").used, 0n);
});

test("correcting an expense to income recomputes totals", () => {
  const confirmed = syntheticTransaction({ status: "confirmed" });
  const original = [confirmed];
  const income = updateConfirmedTransaction(original, confirmed.id, {
    ...valuesOf(confirmed),
    kind: "income",
  });
  assert.equal(demoSummary(income).spending, 0n);
  assert.equal(demoSummary(income).income, 28000n);
  assert.equal(demoSummary(income).confirmed.length, 1);
});

test("invalid corrections, unconfirmed records, and unknown identifiers leave the ledger unchanged", () => {
  const confirmed = Object.freeze(syntheticTransaction({ status: "confirmed" }));
  const original = Object.freeze([confirmed]);
  for (const overrides of [
    { amount: null },
    { amount: 0 },
    { amount: Number.NaN },
    { amount: Number.MAX_SAFE_INTEGER + 1 },
    { date: "2026-02-30" },
    { kind: null },
    { currency: "USD" },
  ]) {
    assert.equal(
      updateConfirmedTransaction(original, confirmed.id, { ...valuesOf(confirmed), ...overrides }),
      original,
    );
  }
  assert.equal(updateConfirmedTransaction(original, "missing", valuesOf(confirmed)), original);
  for (const overrides of [{ status: "pending" }, { status: "confirmed", amount: null }]) {
    const record = syntheticTransaction(overrides);
    const records = [record];
    assert.equal(updateConfirmedTransaction(records, record.id, valuesOf(confirmed)), records);
  }
});

test("correcting a confirmed exclusion to an expense adds it to totals", () => {
  const excluded = syntheticTransaction({ kind: "exclusion", status: "confirmed", amount: null });
  const corrected = updateConfirmedTransaction(
    [excluded],
    excluded.id,
    valuesOf(syntheticTransaction({ kind: "expense", status: "confirmed", amount: 28000 })),
  );
  assert.equal(corrected[0].kind, "expense");
  assert.equal(demoSummary(corrected).spending, 28000n);
});

test("correction inputs cannot overwrite record identity, review status, or extraction metadata", () => {
  const confirmed = syntheticTransaction({ status: "confirmed" });
  const [corrected] = updateConfirmedTransaction([confirmed], confirmed.id, {
    ...valuesOf(confirmed),
    amount: 31000,
    id: "injected-id",
    status: "pending",
    confidence: 100,
    emoji: "injected",
  });
  assert.equal(corrected.id, confirmed.id);
  assert.equal(corrected.status, "confirmed");
  assert.equal(corrected.confidence, confirmed.confidence);
  assert.equal(corrected.emoji, confirmed.emoji);
  assert.equal(corrected.amount, 31000);
});

test("undo restores only the corrected record and preserves later unrelated changes", () => {
  const before = Object.freeze(syntheticTransaction({ status: "confirmed" }));
  const other = syntheticTransaction({ id: "other", status: "confirmed" });
  const corrected = updateConfirmedTransaction([before, other], before.id, {
    ...valuesOf(before),
    amount: 31000,
  });
  const expected = corrected[0];
  const withLaterChange = updateConfirmedTransaction(corrected, other.id, {
    ...valuesOf(other),
    amount: 40000,
  });
  const added = Object.freeze(
    syntheticTransaction({ id: "later", status: "confirmed", amount: 7 }),
  );
  const current = Object.freeze([...withLaterChange, added]);
  const undone = undoTransactionUpdate(current, before, expected);
  assert.equal(undone[0], before);
  assert.equal(undone[1], current[1]);
  assert.equal(undone[2], added);
  assert.equal(demoSummary(undone).spending, 68007n);
  assert.equal(undoTransactionUpdate(undone, before, expected), undone);
});

test("a stale undo cannot overwrite a newer correction, a deleted record, or a different identity", () => {
  const before = syntheticTransaction({ status: "confirmed" });
  const corrected = updateConfirmedTransaction([before], before.id, {
    ...valuesOf(before),
    amount: 31000,
  });
  const newer = updateConfirmedTransaction(corrected, before.id, {
    ...valuesOf(before),
    amount: 40000,
  });
  assert.equal(undoTransactionUpdate(newer, before, corrected[0]), newer);
  const deleted = [];
  assert.equal(undoTransactionUpdate(deleted, before, corrected[0]), deleted);
  assert.equal(
    undoTransactionUpdate(corrected, { ...before, id: "different" }, corrected[0]),
    corrected,
  );
});

test("unknown identifiers leave every record unchanged", () => {
  const records = [
    syntheticTransaction(),
    syntheticTransaction({ id: "synthetic-existing", status: "confirmed" }),
  ];
  assert.deepEqual(excludePendingTransaction(records, "synthetic-missing"), records);
  for (const action of ["edit", "confirm"]) {
    assert.deepEqual(
      updatePendingTransaction(records, "synthetic-missing", valuesOf(records[0]), action),
      records,
    );
  }
});

test("totals include only valid confirmed expenses and income, excluding pending and exclusion types", () => {
  const records = [
    syntheticTransaction({ id: "expense", status: "confirmed", amount: 67000 }),
    syntheticTransaction({ id: "income", status: "confirmed", kind: "income", amount: 200000 }),
    syntheticTransaction({
      id: "reimbursement",
      kind: "exclusion",
      status: "confirmed",
      amount: 900000,
    }),
    syntheticTransaction({ id: "pending-expense", amount: 880000 }),
    syntheticTransaction({ id: "pending-income", kind: "income", amount: 990000 }),
    syntheticTransaction({
      id: "excluded-expense",
      kind: "exclusion",
      status: "confirmed",
      amount: 770000,
    }),
    syntheticTransaction({
      id: "excluded-income",
      status: "confirmed",
      kind: "exclusion",
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
    ["expense", "income"],
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
  assert.equal(shiftMonth("0099-12", 1), "0100-01");
  assert.equal(shiftMonth("0100-01", -1), "0099-12");
  assert.equal(shiftMonth("0000-02", -1), "0000-01");
  assert.equal(daysInMonth("0000-02"), 29);
  assert.equal(daysInMonth("0099-02"), 28);
  assert.equal(daysInMonth("0100-02"), 28);
  assert.equal(daysInMonth("2024-02"), 29);
  assert.equal(daysInMonth("2026-02"), 28);
  assert.equal(daysInMonth("2026-10"), 31);
  assert.equal(formatMonth("2026-10"), "October 2026");
});

test("month shifts reject calendar underflow, overflow and invalid inputs", () => {
  assert.equal(shiftMonth("0000-01", 0), "0000-01");
  assert.equal(shiftMonth("9999-12", 0), "9999-12");
  assert.throws(() => shiftMonth("0000-01", -1), /supported calendar range/);
  assert.throws(() => shiftMonth("9999-12", 1), /supported calendar range/);
  for (const month of ["", "2026-1", "2026-00", "2026-13", "2026-10-01"]) {
    assert.throws(() => shiftMonth(month, 1), /valid calendar month/);
  }
  for (const delta of [0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => shiftMonth("2026-10", delta), /whole number of months/);
  }
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
      id: "reimbursement",
      kind: "exclusion",
      status: "confirmed",
      amount: 9,
    }),
    syntheticTransaction({ id: "last-month", status: "confirmed", date: "2026-09-30", amount: 9 }),
  ];
  const usage = budgetUsage(records, syntheticBudget);
  assert.equal(usage.used, 50000n);
  assert.equal(usage.remaining, 50000n);
  assert.equal(usage.percent, 50);
  assert.equal(usage.state, "on-track");
});

test("budget state distinguishes the warning threshold, exactly at limit, and one rupiah over", () => {
  const at = (amount) =>
    budgetUsage([syntheticTransaction({ status: "confirmed", amount })], syntheticBudget).state;
  assert.equal(at(79999), "on-track");
  assert.equal(at(80000), "warning");
  assert.equal(at(99999), "warning");
  assert.equal(at(100000), "at-limit");
  assert.equal(at(100001), "over");
  assert.equal(at(150000), "over");
  const oneOver = budgetUsage(
    [syntheticTransaction({ status: "confirmed", amount: 100001 })],
    syntheticBudget,
  );
  assert.equal(oneOver.percent, 100);
  assert.equal(oneOver.remaining, -1n);
});

test("high extraction confidence never promotes a pending import into confirmed totals", () => {
  const pending = syntheticTransaction({ confidence: 100 });
  assert.deepEqual(transactionErrors(valuesOf(pending)), {});
  assert.equal(pending.status, "pending");
  assert.equal(demoSummary([pending]).spending, 0n);
  const confirmed = updatePendingTransaction([pending], pending.id, valuesOf(pending), "confirm");
  assert.equal(confirmed[0].status, "confirmed");
  assert.equal(demoSummary(confirmed).spending, 28000n);
});

test("confirmed deletion updates exact spending and budgets without touching other records", () => {
  const deleted = syntheticTransaction({
    id: "delete",
    status: "confirmed",
    amount: Number.MAX_SAFE_INTEGER,
  });
  const remaining = syntheticTransaction({
    id: "keep",
    status: "confirmed",
    amount: Number.MAX_SAFE_INTEGER,
  });
  const income = syntheticTransaction({
    id: "income",
    status: "confirmed",
    kind: "income",
    amount: 8000000,
  });
  const records = [deleted, remaining, income];
  const next = deleteConfirmedTransaction(records, deleted);
  assert.equal(demoSummary(records).spending, 18014398509481982n);
  assert.equal(demoSummary(next).spending, 9007199254740991n);
  assert.equal(demoSummary(next).income, 8000000n);
  assert.equal(budgetUsage(next, syntheticBudget).used, 9007199254740991n);
  assert.deepEqual(next, [remaining, income]);
  assert.equal(next[0], remaining);
  assert.deepEqual(records, [deleted, remaining, income]);
});

test("deletion handles income without changing unrelated totals", () => {
  const expense = syntheticTransaction({ id: "expense", status: "confirmed", amount: 100 });
  const income = syntheticTransaction({
    id: "income",
    status: "confirmed",
    kind: "income",
    amount: 200,
  });
  const records = [expense, income];
  const withoutIncome = demoSummary(deleteConfirmedTransaction(records, income));
  assert.equal(withoutIncome.spending, 100n);
  assert.equal(withoutIncome.income, 0n);
});

test("deletion refuses pending, invalid, missing, ambiguous and stale records", () => {
  for (const overrides of [
    { status: "pending" },
    { status: "confirmed", amount: 0 },
    { status: "confirmed", date: null },
  ]) {
    const target = syntheticTransaction(overrides);
    const records = [target];
    assert.equal(deleteConfirmedTransaction(records, target), records);
  }
  const target = syntheticTransaction({ status: "confirmed" });
  const empty = [];
  assert.equal(deleteConfirmedTransaction(empty, target), empty);
  const newer = { ...target, amount: 50000 };
  const changed = [newer];
  assert.equal(deleteConfirmedTransaction(changed, target), changed);
  const duplicate = [target, { ...target }];
  assert.equal(deleteConfirmedTransaction(duplicate, target), duplicate);
});

test("deletion undo restores the record and totals while retaining unrelated edits and additions", () => {
  const first = syntheticTransaction({ id: "first", status: "confirmed", amount: 100 });
  const deleted = syntheticTransaction({ id: "deleted", status: "confirmed", amount: 200 });
  const last = syntheticTransaction({ id: "last", status: "confirmed", amount: 300 });
  const records = [first, deleted, last];
  const next = deleteConfirmedTransaction(records, deleted);
  const restored = undoTransactionDeletion(next, deleted, 1);
  assert.deepEqual(restored, records);
  assert.equal(restored[1], deleted);
  assert.equal(demoSummary(restored).spending, 600n);
  const edited = { ...first, amount: 150 };
  const added = syntheticTransaction({ id: "added", status: "confirmed", amount: 400 });
  const later = [added, edited, last];
  const restoredLater = undoTransactionDeletion(later, deleted, 1);
  assert.equal(
    restoredLater.find(({ id }) => id === first.id),
    edited,
  );
  assert.equal(
    restoredLater.find(({ id }) => id === added.id),
    added,
  );
  assert.equal(demoSummary(restoredLater).spending, 1050n);
  assert.equal(later.length, 3);
});

test("deletion undo never duplicates an ID or replaces a recreated record", () => {
  const deleted = syntheticTransaction({ status: "confirmed" });
  const recreated = { ...deleted, amount: 50000 };
  const records = [recreated];
  assert.equal(undoTransactionDeletion(records, deleted, 0), records);
  const empty = [];
  for (const index of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(undoTransactionDeletion(empty, deleted, index), empty);
  }
  assert.equal(undoTransactionDeletion(empty, { ...deleted, status: "pending" }, 0), empty);
  assert.equal(undoTransactionDeletion(empty, { ...deleted, amount: 0 }, 0), empty);
  assert.deepEqual(undoTransactionDeletion(empty, deleted, 5), [deleted]);
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

test("safe-to-spend excludes pending, exclusion, income and expenses outside this month", () => {
  const records = [
    syntheticTransaction({ status: "confirmed", amount: 1200 }),
    syntheticTransaction({ amount: 99000 }),
    syntheticTransaction({ status: "confirmed", kind: "exclusion", amount: 99000 }),
    syntheticTransaction({ status: "confirmed", kind: "income", amount: 99000 }),
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
  const unused = budgetUsage([], zero);
  assert.equal(unused.percent, 0);
  assert.equal(unused.state, "on-track");
  assert.deepEqual(demoReminders([], [zero], []), []);
  const spent = budgetUsage([syntheticTransaction({ status: "confirmed", amount: 1 })], zero);
  assert.equal(spent.percent, 100);
  assert.equal(spent.state, "over");
});

test("payday usage respects its as-of date, excludes the previous cycle, and suppresses the calendar daily guide", () => {
  const paydayBudget = { ...syntheticBudget, startsOn: "2026-09-25" };
  const entries = [
    syntheticTransaction({ id: "before", status: "confirmed", date: "2026-09-24", amount: 40000 }),
    syntheticTransaction({ id: "payday", status: "confirmed", date: "2026-09-25", amount: 20000 }),
    syntheticTransaction({ id: "today", status: "confirmed", date: "2026-10-11", amount: 10000 }),
    syntheticTransaction({ id: "next", status: "confirmed", date: "2026-10-25", amount: 50000 }),
  ];
  const usage = budgetUsage(entries, paydayBudget, "2026-10", "2026-10-11");
  assert.equal(usage.used, 30000n);
  assert.equal(usage.periodStartsOn, "2026-09-25");
  assert.equal(usage.periodEndsOn, "2026-10-24");
  assert.equal(safeToSpendToday(entries, [paydayBudget], "2026-10-11").dailyGuideAvailable, false);
  const future = { ...syntheticBudget, startsOn: "2026-10-12" };
  assert.equal(budgetUsage(entries, future, "2026-10", "2026-10-11").periodStartsOn, null);
  assert.equal(safeToSpendToday(entries, [future], "2026-10-11").limit, 0n);
  assert.equal(safeToSpendToday(entries, [future], "2026-10-11").dailyGuideAvailable, false);
});

test("an incomplete exclusion stays valid while an incomplete expense explains what is missing", () => {
  const exclusion = syntheticTransaction({ kind: "exclusion", amount: null, method: null });
  assert.deepEqual(transactionErrors(exclusion), {});
  const expense = transactionErrors(syntheticTransaction({ amount: null, date: null }));
  assert.ok(expense.amount);
  assert.ok(expense.date);
  assert.ok(Object.values(expense).every((message) => !/confidence/i.test(message)));
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
