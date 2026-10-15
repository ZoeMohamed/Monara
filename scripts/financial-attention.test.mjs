import assert from "node:assert/strict";
import test from "node:test";
import {
  demoAttentionBudgets,
  financialAttention,
  mergeNotificationRecords,
  notificationUpdatesCount,
} from "../apps/web/src/data/financial-attention.ts";

const today = "2026-10-14";
const budget = {
  id: "budget",
  name: "Food",
  category: "Food",
  categoryId: null,
  cadence: "monthly",
  startsOn: "2026-09-25",
  limit: 1000n,
  warningPercent: 80,
  active: true,
};
const transaction = (changes = {}) => ({
  id: "expense",
  merchant: "Synthetic merchant",
  category: "Food",
  amount: 800,
  currency: "IDR",
  date: today,
  time: null,
  method: "Cash",
  kind: "expense",
  emoji: "•",
  confidence: null,
  status: "confirmed",
  ...changes,
});
const bill = (changes = {}) => ({
  id: "bill",
  merchant: "Synthetic rent",
  emoji: "•",
  expectedAmount: 2000,
  cadence: "monthly",
  nextDue: "2026-10-13",
  cancellationUrl: null,
  status: "active",
  ...changes,
});
const model = (changes = {}) =>
  financialAttention({
    transactions: [],
    budgets: [],
    bills: [],
    reminders: [],
    today,
    ...changes,
  });

test("pending review is one actionable batch, counts Gmail only from known source, and resolves from ledger state", () => {
  const pending = Array.from({ length: 5 }, (_, index) =>
    transaction({
      id: String(index),
      amount: null,
      status: "pending",
      backend: index < 2 ? { source: "gmail_email" } : undefined,
    }),
  );
  const alerts = model({ transactions: pending });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].title, "5 transactions to review");
  assert.equal(alerts[0].message, "2 from Gmail · Not included in totals.");
  assert.equal(alerts[0].action, "review");
  assert.equal(
    model({ transactions: pending, states: { [alerts[0].id]: "read" } })[0].status,
    "read",
  );
  assert.equal(pending[0].status, "pending");
  assert.deepEqual(
    model({ transactions: pending.map((record) => ({ ...record, status: "confirmed" })) }),
    [],
  );
  assert.equal(model({ transactions: pending.slice(1) })[0].title, "4 transactions to review");
});

test("current payday cycle uses exact confirmed expense totals and recognizes threshold/equality/over separately", () => {
  const unrelated = [
    transaction({ id: "prior-cycle", date: "2026-09-24", amount: 5000 }),
    transaction({ id: "next-cycle", date: "2026-10-25", amount: 5000 }),
    transaction({ id: "income", kind: "income", amount: 5000 }),
    transaction({ id: "invalid", amount: null }),
    transaction({ id: "rejected", status: "rejected", amount: 5000 }),
  ];
  assert.deepEqual(
    model({ budgets: [budget], transactions: [transaction({ amount: 799 }), ...unrelated] }),
    [],
  );
  const warning = model({
    budgets: [budget],
    transactions: [
      transaction({ amount: 400, date: "2026-09-25" }),
      transaction({ id: "second", amount: 400 }),
      ...unrelated,
    ],
  });
  assert.equal(warning.length, 1);
  assert.match(warning[0].title, /near its limit/);
  assert.match(warning[0].message, /800.*1,000.*200 left.*Oct 24/);
  assert.match(
    model({ budgets: [budget], transactions: [transaction({ amount: 1000 })] })[0].title,
    /at its limit/,
  );
  assert.match(
    model({ budgets: [budget], transactions: [transaction({ amount: 1001 })] })[0].message,
    /1 over/,
  );
  assert.deepEqual(
    model({ budgets: [{ ...budget, active: false }], transactions: [transaction()] }),
    [],
  );
  assert.deepEqual(
    model({ budgets: [{ ...budget, startsOn: "2026-10-15" }], transactions: [transaction()] }),
    [],
  );
  const huge = model({
    budgets: [{ ...budget, limit: 18014398509481980n }],
    transactions: [
      transaction({ amount: Number.MAX_SAFE_INTEGER }),
      transaction({ id: "second", amount: Number.MAX_SAFE_INTEGER }),
    ],
  });
  assert.match(huge[0].message, /2 over/);
});

test("weekly cycles and current budgets remain independent of stale presentation usage from a selected old month", () => {
  const [weekly] = model({
    budgets: [{ ...budget, cadence: "weekly", startsOn: "2026-10-03" }],
    transactions: [
      transaction({ date: "2026-10-09", amount: 5000 }),
      transaction({ date: "2026-10-10" }),
    ],
  });
  assert.match(weekly.message, /800.*Oct 16/);
  const mapped = demoAttentionBudgets(
    [
      {
        id: "demo",
        category: "Food",
        cadence: "monthly",
        limit: 1000,
        warningPercent: 80,
        startsOn: "2026-09-25",
        usageMonth: "2026-09",
        usage: { used: { amountMinor: "999999" } },
      },
    ],
    today,
  );
  assert.match(model({ budgets: mapped, transactions: [transaction()] })[0].message, /800.*1,000/);
});

test("stored budget/bill notifications suppress same-cycle duplicates including read/archive, without suppressing other cycles", () => {
  const storedBudget = {
    id: "stored-budget",
    kind: "budget",
    message: "Synthetic",
    backend: {
      kind: "budget_threshold",
      budgetId: budget.id,
      thresholdPercent: 80,
      scheduledFor: "2026-10-10T00:00:00Z",
    },
  };
  assert.deepEqual(
    model({ budgets: [budget], transactions: [transaction()], reminders: [storedBudget] }),
    [],
  );
  assert.equal(
    model({
      budgets: [budget],
      transactions: [transaction()],
      reminders: [
        {
          ...storedBudget,
          backend: { ...storedBudget.backend, scheduledFor: "2026-09-24T00:00:00Z" },
        },
      ],
    }).length,
    1,
  );
  assert.deepEqual(
    model({
      budgets: [budget],
      transactions: [transaction()],
      reminders: [
        {
          id: "budget:budget:2026-09-25:80",
          kind: "budget",
          status: "dismissed",
          message: "Synthetic",
        },
      ],
    }),
    [],
  );
  const storedBill = {
    id: "stored-bill",
    kind: "bill",
    message: "Synthetic",
    backend: {
      kind: "bill_due",
      recurringBillId: "bill",
      offsetDays: 3,
      scheduledFor: "2026-10-14T12:00:00Z",
    },
  };
  assert.deepEqual(
    model({ bills: [bill({ nextDue: "2026-10-17" })], reminders: [storedBill] }),
    [],
  );
  assert.deepEqual(
    model({
      bills: [bill({ nextDue: today })],
      reminders: [
        { id: "bill:bill:2026-10-14:0", kind: "bill", status: "read", message: "Synthetic" },
      ],
    }),
    [],
  );
  assert.equal(
    model({
      bills: [bill()],
      reminders: [
        { ...storedBill, backend: { ...storedBill.backend, recurringBillId: "someone-else" } },
      ],
    }).length,
    1,
  );
});

test("due and overdue bills name actual dates, avoid claiming paid status, and resolve when no longer active", () => {
  const [overdue] = model({ bills: [bill()] });
  assert.match(overdue.title, /was due Oct 13/);
  assert.equal(overdue.message, "Rp 2,000 · Check the payment in your ledger.");
  assert.match(model({ bills: [bill({ nextDue: today })] })[0].title, /due today/);
  assert.equal(model({ bills: [bill({ nextDue: "2026-10-17" })] }).length, 1);
  assert.deepEqual(
    model({ bills: [bill({ nextDue: "2026-10-18" }), bill({ status: "suggested" })] }),
    [],
  );
  assert.equal(
    model({ bills: [bill()], states: { [overdue.id]: "dismissed" } })[0].status,
    "dismissed",
  );
  assert.deepEqual(model({ bills: [] }), []);
});

test("known stored read receipts survive older snapshots so acknowledged warnings cannot reappear as derived alerts", () => {
  const unread = {
    id: "stored",
    kind: "budget",
    message: "Synthetic",
    status: "unread",
    backend: { updatedAt: "2026-10-14T10:00:00Z" },
  };
  const read = { ...unread, status: "read", backend: { updatedAt: "2026-10-14T10:01:00Z" } };
  assert.equal(mergeNotificationRecords([read], [unread])[0].status, "read");
  assert.equal(mergeNotificationRecords([unread], [read])[0].status, "read");
  assert.equal(
    mergeNotificationRecords([read], [{ ...unread, backend: read.backend }])[0].status,
    "read",
  );
});

test("new budget severity resurfaces after reading a lower threshold while duplicate stored rows count once", () => {
  const stored = {
    id: "budget:budget:2026-09-25:80",
    kind: "budget",
    status: "read",
    message: "Earlier warning",
  };
  const [over] = model({
    budgets: [budget],
    transactions: [transaction({ amount: 1001 })],
    reminders: [stored],
  });
  assert.match(over.title, /over budget/);
  assert.equal(over.status, "unread");
  assert.deepEqual(over.coveredReminderIds, [stored.id]);
  assert.equal(notificationUpdatesCount([stored], [over], []), 1);
  const storedLimit = { ...stored, id: "budget:budget:2026-09-25:100", status: "unread" };
  const overLimit = model({
    budgets: [budget],
    transactions: [transaction({ amount: 1001 })],
    reminders: [storedLimit],
  });
  assert.equal(notificationUpdatesCount([storedLimit], overLimit, []), 1);
  assert.equal(
    notificationUpdatesCount(
      [storedLimit],
      overLimit.map((item) => ({ ...item, status: "dismissed" })),
      [],
    ),
    0,
  );
  assert.deepEqual(
    model({
      budgets: [budget],
      transactions: [transaction({ amount: 1000 })],
      reminders: [storedLimit],
    }),
    [],
  );
});

test("changing a budget limit rearms an over-budget alert even after the previous limit was read", () => {
  const transactions = [transaction({ amount: 1200 })];
  const original = model({ budgets: [budget], transactions })[0];
  const states = { [original.id]: "read" };
  const storedRead = {
    id: "old-threshold",
    kind: "budget",
    status: "read",
    message: "Earlier threshold",
    backend: {
      kind: "budget_threshold",
      budgetId: budget.id,
      thresholdPercent: 100,
      scheduledFor: "2026-10-14T10:00:00Z",
      dedupeKey: "budget:budget:2026-09-25:1000:100",
    },
  };
  const storedUnread = {
    ...storedRead,
    id: "rearmed-threshold",
    status: "unread",
    backend: { ...storedRead.backend, dedupeKey: "budget:budget:2026-09-25:1100:100" },
  };
  const rearmed = model({
    budgets: [{ ...budget, limit: 1100n }],
    transactions,
    reminders: [storedRead, storedUnread],
    states,
  });
  assert.equal(rearmed.length, 1);
  assert.notEqual(rearmed[0].id, original.id);
  assert.equal(rearmed[0].status, "unread");
  assert.match(rearmed[0].message, /1,200.*1,100.*100 over/);
  assert.equal(notificationUpdatesCount([storedRead, storedUnread], rearmed, []), 1);
});

test("bill phases resurface from three days ahead to due today and overdue, without duplicate badges", () => {
  const stored = {
    id: "bill:bill:2026-10-14:3",
    kind: "bill",
    status: "read",
    message: "Earlier reminder",
  };
  const due = model({ bills: [bill({ nextDue: today })], reminders: [stored] });
  assert.equal(due.length, 1);
  assert.match(due[0].title, /due today/);
  assert.equal(notificationUpdatesCount([stored], due, []), 1);
  const overdue = model({
    today: "2026-10-15",
    bills: [bill({ nextDue: today })],
    reminders: [stored, { ...stored, id: "bill:bill:2026-10-14:0", status: "unread" }],
  });
  assert.match(overdue[0].title, /was due Oct 14/);
  assert.equal(notificationUpdatesCount([stored], overdue, []), 1);
});

test("badge adds one review batch, unread stored updates, and bill suggestions without counting each transaction", () => {
  const review = model({
    transactions: [
      transaction({ id: "one", status: "pending" }),
      transaction({ id: "two", status: "pending" }),
    ],
  });
  const stored = { id: "stored", kind: "budget", status: "unread", message: "Synthetic" };
  assert.equal(
    notificationUpdatesCount([stored, stored], review, [bill({ status: "suggested" })]),
    3,
  );
  assert.equal(
    notificationUpdatesCount(
      [{ ...stored, status: "read" }],
      review.map((item) => ({ ...item, status: "read" })),
      [],
    ),
    0,
  );
});
