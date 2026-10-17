import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  budgetPeriodForDate,
  calculateBudgetUsage,
  calculateDashboard,
  calculateFinancialInsights,
  createFinanceService,
  FinanceOperationError,
} from "./finance.ts";

const category = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Food & Drinks",
  slug: "food-drinks",
  icon: "utensils",
  color: "#F97316",
  isDefault: true,
  isArchived: false,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

const budget = {
  id: "20000000-0000-4000-8000-000000000002",
  categoryId: category.id,
  name: category.name,
  cadence: "monthly",
  limit: { amountMinor: "1000", currency: "IDR" },
  warningPercent: 80,
  startsOn: "2026-10-01",
  isActive: true,
  deletedAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

function transaction(overrides = {}) {
  return {
    id: "30000000-0000-4000-8000-000000000003",
    kind: "expense",
    merchantName: "Synthetic Coffee",
    money: { amountMinor: "800", currency: "IDR" },
    occurredOn: "2026-10-14",
    occurredTime: null,
    description: null,
    location: null,
    accountHint: null,
    categoryId: category.id,
    financialAccountId: "40000000-0000-4000-8000-000000000004",
    reviewStatus: "confirmed",
    source: "manual_form",
    confidence: null,
    deletedAt: null,
    createdAt: "2026-10-14T01:00:00.000Z",
    updatedAt: "2026-10-14T01:00:00.000Z",
    ...overrides,
  };
}

describe("budget periods and usage", () => {
  it("keeps first-day monthly and anchored seven-day weekly periods", () => {
    assert.deepEqual(budgetPeriodForDate(budget, "2026-10-14"), {
      startsOn: "2026-10-01",
      endsOn: "2026-10-31",
    });
    assert.deepEqual(
      budgetPeriodForDate({ cadence: "weekly", startsOn: "2026-10-03" }, "2026-10-14"),
      { startsOn: "2026-10-10", endsOn: "2026-10-16" },
    );
    assert.equal(budgetPeriodForDate(budget, "2026-09-30"), null);
  });

  it("anchors monthly periods to payday across years without spending before activation", () => {
    const payday = { cadence: "monthly", startsOn: "2026-09-25" };
    assert.deepEqual(budgetPeriodForDate(payday, "2026-10-14"), {
      startsOn: "2026-09-25",
      endsOn: "2026-10-24",
    });
    assert.deepEqual(budgetPeriodForDate(payday, "2026-10-25"), {
      startsOn: "2026-10-25",
      endsOn: "2026-11-24",
    });
    assert.deepEqual(budgetPeriodForDate(payday, "2027-01-01"), {
      startsOn: "2026-12-25",
      endsOn: "2027-01-24",
    });
    assert.equal(budgetPeriodForDate(payday, "2026-09-24"), null);
  });

  it("clamps 29th, 30th, and 31st anchors in short months without losing the original day", () => {
    for (const day of [29, 30, 31]) {
      const anchored = { cadence: "monthly", startsOn: `2026-01-${day}` };
      assert.deepEqual(budgetPeriodForDate(anchored, "2026-02-28"), {
        startsOn: "2026-02-28",
        endsOn: `2026-03-${day - 1}`,
      });
      assert.deepEqual(budgetPeriodForDate(anchored, `2026-03-${day}`), {
        startsOn: `2026-03-${day}`,
        endsOn: `2026-04-${Math.min(day, 30) - 1}`,
      });
    }
    assert.deepEqual(
      budgetPeriodForDate({ cadence: "monthly", startsOn: "2024-01-31" }, "2024-02-29"),
      {
        startsOn: "2024-02-29",
        endsOn: "2024-03-30",
      },
    );
    assert.deepEqual(
      budgetPeriodForDate({ cadence: "monthly", startsOn: "2024-01-29" }, "2024-02-28"),
      {
        startsOn: "2024-01-29",
        endsOn: "2024-02-28",
      },
    );
  });

  it("preserves supported years below 100 instead of remapping them to the twentieth century", () => {
    assert.deepEqual(
      budgetPeriodForDate({ cadence: "monthly", startsOn: "0000-01-31" }, "0000-02-29"),
      {
        startsOn: "0000-02-29",
        endsOn: "0000-03-30",
      },
    );
    assert.deepEqual(
      budgetPeriodForDate({ cadence: "monthly", startsOn: "0099-01-30" }, "0099-02-28"),
      {
        startsOn: "0099-02-28",
        endsOn: "0099-03-29",
      },
    );
  });

  it("accepts the last supported calendar-month period and rejects intervals extending past year 9999", () => {
    assert.deepEqual(
      budgetPeriodForDate({ cadence: "monthly", startsOn: "9999-12-01" }, "9999-12-31"),
      {
        startsOn: "9999-12-01",
        endsOn: "9999-12-31",
      },
    );
    assert.deepEqual(
      budgetPeriodForDate({ cadence: "weekly", startsOn: "9999-12-25" }, "9999-12-31"),
      {
        startsOn: "9999-12-25",
        endsOn: "9999-12-31",
      },
    );
    for (const cadence of ["monthly", "weekly"]) {
      assert.throws(() => budgetPeriodForDate({ cadence, startsOn: "9999-12-26" }, "9999-12-31"), {
        name: "RangeError",
        message: "Budget period extends beyond supported calendar dates.",
      });
    }
  });

  it("counts only confirmed, non-deleted expenses in the category and period", () => {
    const usage = calculateBudgetUsage(budget, { startsOn: "2026-10-01", endsOn: "2026-10-31" }, [
      transaction(),
      transaction({
        id: crypto.randomUUID(),
        reviewStatus: "pending",
        money: { amountMinor: "500", currency: "IDR" },
      }),
      transaction({
        id: crypto.randomUUID(),
        kind: "income",
        money: { amountMinor: "2000", currency: "IDR" },
      }),
      transaction({ id: crypto.randomUUID(), deletedAt: "2026-10-14T02:00:00.000Z" }),
      transaction({ id: crypto.randomUUID(), occurredOn: "2026-11-01" }),
    ]);
    assert.equal(usage.used.amountMinor, "800");
    assert.equal(usage.remaining.amountMinor, "200");
    assert.equal(usage.usagePercent, 80);
    assert.equal(usage.state, "warning");
  });
});

describe("dashboard aggregates", () => {
  it("excludes pending and exclusion rows from exact monthly totals", () => {
    const summary = calculateDashboard({
      month: "2026-10",
      today: "2026-10-15",
      categories: [category],
      budgets: [budget],
      reminders: [],
      transactions: [
        transaction(),
        transaction({
          id: crypto.randomUUID(),
          kind: "income",
          categoryId: null,
          money: { amountMinor: "2000", currency: "IDR" },
        }),
        transaction({
          id: crypto.randomUUID(),
          kind: "exclusion",
          reviewStatus: "confirmed",
          categoryId: null,
          money: { amountMinor: "500", currency: "IDR" },
        }),
        transaction({
          id: crypto.randomUUID(),
          reviewStatus: "pending",
          money: { amountMinor: "999", currency: "IDR" },
        }),
      ],
    });
    assert.equal(summary.income.amountMinor, "2000");
    assert.equal(summary.spending.amountMinor, "800");
    assert.equal(summary.difference.amountMinor, "1200");
    assert.equal(summary.remainingBudget.amountMinor, "200");
    assert.equal(summary.pace.averageDailySpending.amountMinor, "53");
    assert.equal(summary.categoryBreakdown[0].categoryName, "Food & Drinks");
    assert.equal(summary.categoryBreakdown[0].sharePercent, 100);
    assert.equal(summary.insights.savingsRate.ratePercent, 60);
    assert.equal(summary.insights.safeToSpend.overall.dailyAmount.amountMinor, "11");
    assert.equal(summary.insights.overspendForecasts[0].projectedOverspend.amountMinor, "653");
  });
});

describe("financial insights", () => {
  it("flags only reproducible outliers against three months of confirmed category history", () => {
    const historyTransactions = [100, 110, 120].map((amount, index) =>
      transaction({
        id: crypto.randomUUID(),
        occurredOn: `2026-0${7 + index}-10`,
        money: { amountMinor: String(amount), currency: "IDR" },
      }),
    );
    historyTransactions.push(
      transaction({
        id: crypto.randomUUID(),
        occurredOn: "2026-09-11",
        reviewStatus: "pending",
        money: { amountMinor: "1", currency: "IDR" },
      }),
    );
    const current = transaction();
    const insights = calculateFinancialInsights({
      month: "2026-10",
      asOf: "2026-10-15",
      income: 2000n,
      spending: 800n,
      transactions: [current],
      historyTransactions,
      budgetUsage: [
        calculateBudgetUsage(budget, { startsOn: "2026-10-01", endsOn: "2026-10-31" }, [current]),
      ],
      categories: [category],
    });
    assert.equal(insights.unusualTransactions.length, 1);
    assert.equal(insights.unusualTransactions[0].historyMedian.amountMinor, "110");
    assert.equal(insights.unusualTransactions[0].historyTransactionCount, 3);
    assert.equal(insights.unusualTransactions[0].multipleOfMedian, 7.27);
    assert.equal(insights.safeToSpend.byCategory[0].dailyAmount.amountMinor, "11");
  });
});

describe("Budget suggestions", () => {
  it("rejects calendar ranges that cannot contain three complete prior months", async () => {
    const unsupportedNow = new Date(0);
    unsupportedNow.setUTCFullYear(0, 2, 1);
    const service = createFinanceService({}, { now: () => unsupportedNow });

    await assert.rejects(
      service.suggestBudget(
        {
          userId: "60000000-0000-4000-8000-000000000006",
          channel: "web",
        },
        { categoryId: category.id, cadence: "monthly" },
      ),
      (error) => error instanceof FinanceOperationError && error.code === "CONFLICT",
    );
  });

  it("uses the previous three complete months and never invents missing history", async () => {
    let requestedRange;
    const history = [
      transaction({ occurredOn: "2026-07-10", money: { amountMinor: "200", currency: "IDR" } }),
      transaction({
        id: crypto.randomUUID(),
        occurredOn: "2026-08-10",
        money: { amountMinor: "300", currency: "IDR" },
      }),
      transaction({
        id: crypto.randomUUID(),
        occurredOn: "2026-09-10",
        money: { amountMinor: "400", currency: "IDR" },
      }),
      transaction({
        id: crypto.randomUUID(),
        occurredOn: "2026-09-15",
        kind: "income",
        categoryId: null,
        money: { amountMinor: "9000", currency: "IDR" },
      }),
      transaction({
        id: crypto.randomUUID(),
        occurredOn: "2026-09-20",
        reviewStatus: "pending",
        money: { amountMinor: "9999", currency: "IDR" },
      }),
    ];
    const repository = {
      async listAllCategories() {
        return [category];
      },
      async listTransactionsForDateRange(_userId, startsOn, endsOn) {
        requestedRange = { startsOn, endsOn };
        return history;
      },
    };
    const service = createFinanceService(repository, {
      now: () => new Date("2026-10-16T05:00:00.000Z"),
    });
    const caller = {
      userId: "60000000-0000-4000-8000-000000000006",
      channel: "web",
    };
    const monthly = await service.suggestBudget(caller, {
      categoryId: category.id,
      cadence: "monthly",
    });
    assert.deepEqual(requestedRange, { startsOn: "2026-07-01", endsOn: "2026-09-30" });
    assert.equal(monthly.proposedLimit.amountMinor, "300");
    assert.equal(monthly.confirmedIncome.amountMinor, "9000");
    assert.equal(monthly.confirmedSpending.amountMinor, "900");

    const weekly = await service.suggestBudget(caller, {
      categoryId: category.id,
      cadence: "weekly",
    });
    assert.equal(weekly.proposedLimit.amountMinor, "68");

    history.splice(0);
    await assert.rejects(
      service.suggestBudget(caller, { categoryId: category.id, cadence: "monthly" }),
      (error) => error instanceof FinanceOperationError && error.code === "CONFLICT",
    );
  });
});

describe("Budget threshold events", () => {
  it("creates each 80% and 100% Reminder once for the period", async () => {
    const rows = [];
    const dedupe = new Set();
    let amount = "800";
    const repository = {
      async createTransaction({ source, values }) {
        const row = transaction({
          id: crypto.randomUUID(),
          source,
          money: values.money,
          merchantName: values.merchantName,
        });
        rows.push(row);
        return row;
      },
      async recordUndoAction(input) {
        return {
          actionId: crypto.randomUUID(),
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          changedAt: input.changedAt,
          undoExpiresAt: input.undoExpiresAt,
        };
      },
      async listAllBudgets() {
        return [budget];
      },
      async listTransactionsForMonth() {
        return [transaction({ money: { amountMinor: amount, currency: "IDR" } })];
      },
      async listTransactionsForDateRange() {
        return [transaction({ money: { amountMinor: amount, currency: "IDR" } })];
      },
      async createBudgetThresholdReminder(input) {
        dedupe.add(input.dedupeKey);
        return null;
      },
    };
    const service = createFinanceService(repository, {
      now: () => new Date("2026-10-14T05:00:00.000Z"),
    });
    const caller = {
      userId: "60000000-0000-4000-8000-000000000006",
      channel: "web",
      directSource: "manual_form",
    };
    const input = {
      clientRequestId: "threshold-test",
      kind: "expense",
      merchantName: "Synthetic Coffee",
      money: { amountMinor: "800", currency: "IDR" },
      occurredOn: "2026-10-14",
      occurredTime: null,
      description: null,
      location: null,
      accountHint: null,
      categoryId: category.id,
      financialAccountId: "40000000-0000-4000-8000-000000000004",
    };
    await service.addTransaction(caller, input);
    await service.addTransaction(caller, { ...input, clientRequestId: "threshold-retry" });
    assert.equal(dedupe.size, 1);
    assert.match([...dedupe][0], /:80$/);

    amount = "1000";
    await service.addTransaction(caller, { ...input, clientRequestId: "threshold-full" });
    assert.equal(dedupe.size, 2);
    assert.ok([...dedupe].some((key) => key.endsWith(":100")));
  });
});

function createMemoryFinanceRepository() {
  let sequence = 100;
  let tick = 0;
  const nextId = () => `00000000-0000-4000-8000-${(sequence++).toString(16).padStart(12, "0")}`;
  const stamp = () =>
    new Date(Date.parse("2026-10-15T01:00:00.000Z") + tick++ * 1_000).toISOString();
  const owned = (rows, ownerId) => rows.filter((entry) => entry.ownerId === ownerId);
  const page = (rows, input) => {
    const offset = Number(input.cursor ?? 0);
    const limit = input.limit ?? 50;
    return {
      items: rows.slice(offset, offset + limit).map((entry) => entry.value),
      nextCursor: rows.length > offset + limit ? String(offset + limit) : null,
    };
  };
  const changed = (entry, expectedUpdatedAt, changes) => {
    if (!entry) throw new FinanceOperationError("NOT_FOUND", "The record was not found.");
    if (entry.value.updatedAt !== expectedUpdatedAt) {
      throw new FinanceOperationError("CONFLICT", "The record changed.");
    }
    entry.value = { ...entry.value, ...changes, updatedAt: stamp() };
    return entry.value;
  };

  const transactions = [];
  const accounts = [];
  const budgets = [];
  const reminders = [];
  const reminderKeys = new Set();
  const actions = [];
  const confirmations = [];
  const categoryNames = [
    "Food & Drinks",
    "Transport",
    "Shopping",
    "Bills & Utilities",
    "Entertainment",
    "Health",
    "Education",
    "Groceries",
    "Housing",
    "Travel",
    "Personal Care",
    "Gifts & Donations",
    "Subscriptions",
    "Income",
    "Other",
  ];
  const categories = categoryNames.map((name, index) => ({
    ownerId: null,
    value: {
      ...category,
      id: index === 0 ? category.id : nextId(),
      name,
      slug: name.toLowerCase().replaceAll(" & ", "-").replaceAll(" ", "-"),
    },
  }));

  const categoriesFor = (ownerId) =>
    categories.map((entry) => ({ ...entry, ownerId, value: { ...entry.value } }));
  const categoryOwners = new Map();
  const userCategories = (ownerId) => {
    let rows = categoryOwners.get(ownerId);
    if (!rows) {
      rows = categoriesFor(ownerId);
      categoryOwners.set(ownerId, rows);
    }
    return rows;
  };

  const repository = {
    async listTransactions(ownerId, input) {
      const rows = owned(transactions, ownerId).filter(
        (entry) =>
          !entry.value.deletedAt &&
          (!input.reviewStatus || entry.value.reviewStatus === input.reviewStatus) &&
          (!input.kind || entry.value.kind === input.kind) &&
          (!input.month || entry.value.occurredOn?.startsWith(input.month)),
      );
      return page(rows, input);
    },
    async listTransactionsForMonth(ownerId, month) {
      return owned(transactions, ownerId)
        .filter((entry) => !entry.value.deletedAt && entry.value.occurredOn?.startsWith(month))
        .map((entry) => entry.value);
    },
    async listTransactionsForDateRange(ownerId, startsOn, endsOn) {
      return owned(transactions, ownerId)
        .filter(
          (entry) =>
            !entry.value.deletedAt &&
            entry.value.occurredOn &&
            entry.value.occurredOn >= startsOn &&
            entry.value.occurredOn <= endsOn,
        )
        .map((entry) => entry.value);
    },
    async findTransaction(ownerId, transactionId) {
      return (
        transactions.find((entry) => entry.ownerId === ownerId && entry.value.id === transactionId)
          ?.value ?? null
      );
    },
    async createTransaction({ userId, source, values }) {
      const existing = transactions.find(
        (entry) => entry.ownerId === userId && entry.clientRequestId === values.clientRequestId,
      );
      if (existing) return existing.value;
      const createdAt = stamp();
      const row = {
        id: nextId(),
        kind: values.kind,
        merchantName: values.merchantName,
        money: values.money,
        occurredOn: values.occurredOn,
        occurredTime: values.occurredTime,
        description: values.description,
        location: values.location,
        accountHint: values.accountHint,
        categoryId: values.categoryId,
        financialAccountId: values.financialAccountId,
        reviewStatus: "confirmed",
        source,
        confidence: null,
        deletedAt: null,
        createdAt,
        updatedAt: createdAt,
      };
      transactions.push({ ownerId: userId, clientRequestId: values.clientRequestId, value: row });
      return row;
    },
    async replaceTransaction(input) {
      const entry = transactions.find(
        (candidate) =>
          candidate.ownerId === input.userId && candidate.value.id === input.transactionId,
      );
      return changed(entry, input.expectedUpdatedAt, {
        ...input.values,
        reviewStatus: input.reviewStatus,
      });
    },
    async softDeleteTransaction(input) {
      const entry = transactions.find(
        (candidate) =>
          candidate.ownerId === input.userId && candidate.value.id === input.transactionId,
      );
      return changed(entry, input.expectedUpdatedAt, { deletedAt: input.deletedAt });
    },
    async listFinancialAccounts(ownerId, input) {
      const rows = owned(accounts, ownerId).filter(
        (entry) => input.isActive === undefined || entry.value.isActive === input.isActive,
      );
      return page(rows, input);
    },
    async createFinancialAccount(ownerId, input) {
      const existing = accounts.find(
        (entry) => entry.ownerId === ownerId && entry.clientRequestId === input.clientRequestId,
      );
      if (existing) return existing.value;
      const createdAt = stamp();
      const row = {
        id: nextId(),
        name: input.name,
        institution: input.institution,
        accountType: input.accountType,
        currency: input.currency,
        lastFour: input.lastFour,
        institutionKey: input.institutionKey,
        isActive: true,
        createdAt,
        updatedAt: createdAt,
      };
      accounts.push({ ownerId, clientRequestId: input.clientRequestId, value: row });
      return row;
    },
    async updateFinancialAccount(ownerId, input) {
      const entry = accounts.find(
        (candidate) =>
          candidate.ownerId === ownerId && candidate.value.id === input.financialAccountId,
      );
      return changed(entry, input.expectedUpdatedAt, input.changes);
    },
    async listCategories(ownerId, input) {
      const rows = userCategories(ownerId).filter(
        (entry) => input.isArchived === undefined || entry.value.isArchived === input.isArchived,
      );
      return page(rows, input);
    },
    async listAllCategories(ownerId) {
      return userCategories(ownerId).map((entry) => entry.value);
    },
    async updateCategory(ownerId, input) {
      const entry = userCategories(ownerId).find(
        (candidate) => candidate.value.id === input.categoryId,
      );
      return changed(entry, input.expectedUpdatedAt, input.changes);
    },
    async listBudgets(ownerId, input) {
      const rows = owned(budgets, ownerId).filter(
        (entry) =>
          !entry.value.deletedAt &&
          (!input.cadence || entry.value.cadence === input.cadence) &&
          (input.isActive === undefined || entry.value.isActive === input.isActive),
      );
      return page(rows, input);
    },
    async listAllBudgets(ownerId) {
      return owned(budgets, ownerId)
        .filter((entry) => !entry.value.deletedAt)
        .map((entry) => entry.value);
    },
    async findBudget(ownerId, budgetId) {
      return (
        budgets.find((entry) => entry.ownerId === ownerId && entry.value.id === budgetId)?.value ??
        null
      );
    },
    async createBudget(ownerId, input) {
      const existing = budgets.find(
        (entry) => entry.ownerId === ownerId && entry.clientRequestId === input.clientRequestId,
      );
      if (existing) return existing.value;
      const createdAt = stamp();
      const row = {
        id: nextId(),
        categoryId: input.categoryId,
        name: input.name,
        cadence: input.cadence,
        limit: input.limit,
        warningPercent: input.warningPercent,
        startsOn: input.startsOn,
        isActive: true,
        deletedAt: null,
        createdAt,
        updatedAt: createdAt,
      };
      budgets.push({ ownerId, clientRequestId: input.clientRequestId, value: row });
      return row;
    },
    async updateBudget(ownerId, input) {
      const entry = budgets.find(
        (candidate) => candidate.ownerId === ownerId && candidate.value.id === input.budgetId,
      );
      return changed(entry, input.expectedUpdatedAt, input.changes);
    },
    async softDeleteBudget(input) {
      const entry = budgets.find(
        (candidate) => candidate.ownerId === input.userId && candidate.value.id === input.budgetId,
      );
      return changed(entry, input.expectedUpdatedAt, { deletedAt: input.deletedAt });
    },
    async listUnreadReminders(ownerId, limit) {
      return owned(reminders, ownerId)
        .filter((entry) => entry.value.status === "unread")
        .slice(0, limit)
        .map((entry) => entry.value);
    },
    async listReminders(ownerId, input) {
      return page(
        owned(reminders, ownerId).filter(
          (entry) =>
            (!input.status || entry.value.status === input.status) &&
            (!input.kind || entry.value.kind === input.kind),
        ),
        input,
      );
    },
    async findReminder(ownerId, reminderId) {
      return (
        reminders.find((entry) => entry.ownerId === ownerId && entry.value.id === reminderId)
          ?.value ?? null
      );
    },
    async updateReminder(input) {
      const entry = reminders.find(
        (item) => item.ownerId === input.userId && item.value.id === input.reminderId,
      );
      if (!entry) throw new FinanceOperationError("NOT_FOUND", "Notification not found.");
      if (entry.value.status !== input.expectedStatus)
        throw new FinanceOperationError("CONFLICT", "Notification changed.");
      entry.value = {
        ...entry.value,
        status: input.status,
        readAt: input.readAt,
        updatedAt: stamp(),
      };
      return entry.value;
    },
    async createBudgetThresholdReminder(input) {
      const scopedKey = `${input.userId}:${input.dedupeKey}`;
      if (reminderKeys.has(scopedKey)) return null;
      reminderKeys.add(scopedKey);
      const createdAt = stamp();
      const id = nextId();
      reminders.push({
        ownerId: input.userId,
        value: {
          id,
          kind: "budget_threshold",
          status: "unread",
          budgetId: input.budget.id,
          thresholdPercent: input.thresholdPercent,
          title: `${input.budget.name} Budget`,
          message: `${input.thresholdPercent}% threshold reached.`,
          dedupeKey: input.dedupeKey,
          scheduledFor: input.scheduledFor,
          readAt: null,
          createdAt,
          updatedAt: createdAt,
        },
      });
      return id;
    },
    async createDestructiveConfirmation(input) {
      const confirmationId = nextId();
      confirmations.push({
        ownerId: input.userId,
        confirmationId,
        state: input.state,
        expiresAt: input.expiresAt,
        consumedAt: null,
      });
      return confirmationId;
    },
    async findDestructiveConfirmation(ownerId, confirmationId) {
      const confirmation = confirmations.find(
        (entry) => entry.ownerId === ownerId && entry.confirmationId === confirmationId,
      );
      return confirmation
        ? {
            state: confirmation.state,
            expiresAt: confirmation.expiresAt,
            consumedAt: confirmation.consumedAt,
          }
        : null;
    },
    async consumeDestructiveConfirmation(input) {
      const confirmation = confirmations.find(
        (entry) =>
          entry.ownerId === input.userId &&
          entry.confirmationId === input.confirmationId &&
          entry.consumedAt === null &&
          entry.expiresAt > input.consumedAt,
      );
      if (!confirmation) return false;
      confirmation.consumedAt = input.consumedAt;
      return true;
    },
    async recordUndoAction(input) {
      const receipt = {
        actionId: nextId(),
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        changedAt: input.changedAt,
        undoExpiresAt: input.undoExpiresAt,
      };
      actions.push({ ownerId: input.userId, state: input.state, receipt, consumedAt: null });
      return receipt;
    },
    async findUndoAction(ownerId, actionId) {
      const action = actions.find(
        (entry) => entry.ownerId === ownerId && entry.receipt.actionId === actionId,
      );
      return action
        ? {
            state: structuredClone(action.state),
            resourceType: action.receipt.resourceType,
            resourceId: action.receipt.resourceId,
            expiresAt: action.receipt.undoExpiresAt,
            consumedAt: action.consumedAt,
          }
        : null;
    },
    async consumeUndoAction(input) {
      const action = actions.find(
        (entry) =>
          entry.ownerId === input.userId &&
          entry.receipt.actionId === input.actionId &&
          entry.consumedAt === null &&
          entry.receipt.undoExpiresAt > input.consumedAt,
      );
      if (!action) return false;
      action.consumedAt = input.consumedAt;
      return true;
    },
  };

  return {
    repository,
    state: { actions, budgets, confirmations, reminderKeys, reminders, transactions },
    seedPending(ownerId, overrides = {}) {
      const createdAt = stamp();
      const row = transaction({
        id: nextId(),
        money: null,
        occurredOn: null,
        financialAccountId: null,
        reviewStatus: "pending",
        source: "gmail_email",
        confidence: 0.6,
        createdAt,
        updatedAt: createdAt,
        ...overrides,
      });
      transactions.push({ ownerId, clientRequestId: null, value: row });
      return row;
    },
  };
}

const ownerA = "60000000-0000-4000-8000-000000000006";
const ownerB = "70000000-0000-4000-8000-000000000007";
const callerA = { userId: ownerA, channel: "web", directSource: "manual_form" };

describe("owned notification read and dismissal", () => {
  it("isolates Users, preserves read receipts, checks stale state, and permits safe retries", async () => {
    const memory = createMemoryFinanceRepository();
    const service = createFinanceService(memory.repository, {
      now: () => new Date("2026-10-14T12:00:00Z"),
    });
    await memory.repository.createBudgetThresholdReminder({
      userId: ownerA,
      budget,
      periodStartsOn: "2026-10-01",
      thresholdPercent: 80,
      usage: { amountMinor: "800", currency: "IDR" },
      scheduledFor: "2026-10-14T12:00:00Z",
      dedupeKey: "synthetic-reminder",
    });
    const notification = (await service.listReminders(callerA, {})).items[0];
    assert.equal((await service.listReminders({ ...callerA, userId: ownerB }, {})).items.length, 0);
    await assert.rejects(
      service.markReminderRead(
        { ...callerA, userId: ownerB },
        { reminderId: notification.id, expectedStatus: "unread" },
      ),
      { code: "NOT_FOUND" },
    );
    const read = await service.markReminderRead(callerA, {
      reminderId: notification.id,
      expectedStatus: "unread",
    });
    assert.equal(read.status, "read");
    assert.equal(read.readAt, "2026-10-14T12:00:00.000Z");
    assert.deepEqual(
      await service.markReminderRead(callerA, {
        reminderId: notification.id,
        expectedStatus: "unread",
      }),
      read,
    );
    assert.equal(
      (await service.getDashboard(callerA, { month: "2026-10" })).activeReminders.length,
      0,
    );
    await assert.rejects(
      service.dismissReminder(callerA, { reminderId: notification.id, expectedStatus: "unread" }),
      { code: "CONFLICT" },
    );
    const dismissed = await service.dismissReminder(callerA, {
      reminderId: notification.id,
      expectedStatus: "read",
    });
    assert.equal(dismissed.readAt, read.readAt);
    assert.equal(dismissed.status, "dismissed");
    assert.deepEqual(
      await service.dismissReminder(callerA, {
        reminderId: notification.id,
        expectedStatus: "read",
      }),
      dismissed,
    );
    await assert.rejects(
      service.markReminderRead(callerA, { reminderId: notification.id, expectedStatus: "read" }),
      { code: "CONFLICT" },
    );
    assert.equal(memory.state.transactions.length, 0);
  });
});

describe("payday budget usage reads across month boundaries", () => {
  it("uses the same future-month cycle and activation date as the dashboard", async () => {
    const memory = createMemoryFinanceRepository();
    const service = createFinanceService(memory.repository, {
      now: () => new Date("2026-10-14T12:00:00Z"),
    });
    for (const [clientRequestId, startsOn] of [
      ["synthetic-upcoming-cycle", "2026-09-25"],
      ["synthetic-later-activation", "2026-11-25"],
    ]) {
      await service.createBudget(callerA, {
        clientRequestId,
        categoryId: category.id,
        name: "Payday food",
        cadence: "monthly",
        startsOn,
        limit: { amountMinor: "1000", currency: "IDR" },
      });
    }
    for (const [occurredOn, amountMinor] of [
      ["2026-10-26", "200"],
      ["2026-11-05", "300"],
      ["2026-11-26", "900"],
    ]) {
      memory.seedPending(ownerA, {
        reviewStatus: "confirmed",
        occurredOn,
        money: { amountMinor, currency: "IDR" },
      });
    }

    const usage = await service.listBudgetUsage(callerA, { month: "2026-11" });
    const dashboard = await service.getDashboard(callerA, { month: "2026-11" });
    assert.deepEqual(usage, dashboard.budgetUsage);
    assert.equal(usage.length, 1);
    assert.equal(usage[0].periodStartsOn, "2026-10-25");
    assert.equal(usage[0].periodEndsOn, "2026-11-24");
    assert.equal(usage[0].used.amountMinor, "500");
  });

  it("loads the following month's confirmed payments inside the active cycle without changing monthly totals", async () => {
    const memory = createMemoryFinanceRepository();
    const service = createFinanceService(memory.repository, {
      now: () => new Date("2026-10-28T12:00:00Z"),
    });
    await service.createBudget(callerA, {
      clientRequestId: "synthetic-next-month-payday",
      categoryId: category.id,
      name: "Payday food",
      cadence: "monthly",
      startsOn: "2026-10-25",
      limit: { amountMinor: "1000", currency: "IDR" },
    });
    memory.seedPending(ownerA, {
      reviewStatus: "confirmed",
      occurredOn: "2026-11-05",
      money: { amountMinor: "800", currency: "IDR" },
    });
    for (const occurredOn of ["2026-10-24", "2026-11-25"]) {
      memory.seedPending(ownerA, {
        reviewStatus: "confirmed",
        occurredOn,
        money: { amountMinor: "100", currency: "IDR" },
      });
    }
    memory.seedPending(ownerA, {
      occurredOn: "2026-11-10",
      money: { amountMinor: "100", currency: "IDR" },
    });
    memory.seedPending(ownerB, {
      reviewStatus: "confirmed",
      occurredOn: "2026-11-05",
      money: { amountMinor: "900", currency: "IDR" },
    });
    const [usage] = await service.listBudgetUsage(callerA, { month: "2026-10" });
    assert.equal(usage.periodStartsOn, "2026-10-25");
    assert.equal(usage.periodEndsOn, "2026-11-24");
    assert.equal(usage.used.amountMinor, "800");
    const dashboard = await service.getDashboard(callerA, { month: "2026-10" });
    assert.deepEqual(dashboard.budgetUsage[0], usage);
    assert.equal(dashboard.spending.amountMinor, "100");
    assert.equal(dashboard.recentTransactions.length, 1);
    assert.equal(dashboard.recentTransactions[0].occurredOn, "2026-10-24");
  });

  it("loads the final supported month without reading year 10000 and fails explicitly on unsupported active cycles", async () => {
    const memory = createMemoryFinanceRepository();
    const service = createFinanceService(memory.repository, {
      now: () => new Date("9999-12-31T12:00:00Z"),
    });
    await service.createBudget(callerA, {
      clientRequestId: "synthetic-final-month",
      categoryId: category.id,
      name: "Final calendar month",
      cadence: "monthly",
      startsOn: "9999-12-01",
      limit: { amountMinor: "1000", currency: "IDR" },
    });
    memory.seedPending(ownerA, {
      reviewStatus: "confirmed",
      occurredOn: "9999-12-31",
      money: { amountMinor: "800", currency: "IDR" },
    });
    const [usage] = await service.listBudgetUsage(callerA, { month: "9999-12" });
    assert.equal(usage.periodStartsOn, "9999-12-01");
    assert.equal(usage.periodEndsOn, "9999-12-31");
    assert.equal(usage.used.amountMinor, "800");
    const dashboard = await service.getDashboard(callerA, { month: "9999-12" });
    assert.deepEqual(dashboard.budgetUsage[0], usage);
    assert.equal(dashboard.spending.amountMinor, "800");
    await memory.repository.createBudget(ownerA, {
      clientRequestId: "synthetic-unsupported-cycle",
      categoryId: category.id,
      name: "Unsupported cycle",
      cadence: "weekly",
      startsOn: "9999-12-26",
      limit: { amountMinor: "1000", currency: "IDR" },
      warningPercent: 80,
    });
    const failure = {
      name: "RangeError",
      message: "Budget period extends beyond supported calendar dates.",
    };
    await assert.rejects(service.listBudgetUsage(callerA, { month: "9999-12" }), failure);
    await assert.rejects(service.getDashboard(callerA, { month: "9999-12" }), failure);
  });

  it("loads preceding-month spending and excludes earlier, pending, and next-cycle records", async () => {
    const memory = createMemoryFinanceRepository();
    const service = createFinanceService(memory.repository, {
      now: () => new Date("2026-10-14T12:00:00Z"),
    });
    await service.createBudget(callerA, {
      clientRequestId: "synthetic-payday",
      categoryId: category.id,
      name: "Payday food",
      cadence: "monthly",
      startsOn: "2026-09-25",
      limit: { amountMinor: "1000", currency: "IDR" },
    });
    memory.seedPending(ownerA, {
      reviewStatus: "confirmed",
      occurredOn: "2026-09-25",
      money: { amountMinor: "100", currency: "IDR" },
    });
    memory.seedPending(ownerA, {
      reviewStatus: "confirmed",
      occurredOn: "2026-10-14",
      money: { amountMinor: "200", currency: "IDR" },
    });
    memory.seedPending(ownerA, {
      reviewStatus: "confirmed",
      occurredOn: "2026-09-24",
      money: { amountMinor: "500", currency: "IDR" },
    });
    memory.seedPending(ownerA, {
      reviewStatus: "confirmed",
      occurredOn: "2026-10-25",
      money: { amountMinor: "500", currency: "IDR" },
    });
    memory.seedPending(ownerA, {
      occurredOn: "2026-10-14",
      money: { amountMinor: "500", currency: "IDR" },
    });
    const usage = (await service.listBudgetUsage(callerA, { month: "2026-10" }))[0];
    assert.equal(usage.used.amountMinor, "300");
    assert.equal(usage.periodStartsOn, "2026-09-25");
    assert.equal(usage.periodEndsOn, "2026-10-24");
    const dashboard = await service.getDashboard(callerA, { month: "2026-10" });
    assert.equal(dashboard.budgetUsage[0].used.amountMinor, "300");
    assert.equal(dashboard.spending.amountMinor, "700");
  });
});

describe("ZO6 Review Queue service simulation", () => {
  it("edits, confirms, rejects, and isolates pending Gmail transactions by User", async () => {
    const memory = createMemoryFinanceRepository();
    const service = createFinanceService(memory.repository, {
      now: () => new Date("2026-10-15T05:00:00.000Z"),
    });
    const account = await service.createFinancialAccount(callerA, {
      clientRequestId: "review-account",
      name: "Main Wallet",
      institution: "Synthetic Bank",
      accountType: "wallet",
      currency: "IDR",
      lastFour: "1234",
    });
    const pending = memory.seedPending(ownerA);
    const edited = await service.editPending(callerA, {
      transactionId: pending.id,
      expectedUpdatedAt: pending.updatedAt,
      changes: {
        money: { amountMinor: "28000", currency: "IDR" },
        occurredOn: "2026-10-15",
        categoryId: category.id,
        financialAccountId: account.financialAccount.id,
      },
    });
    assert.equal(edited.transaction.reviewStatus, "pending");
    assert.equal(edited.transaction.money.amountMinor, "28000");

    await assert.rejects(
      service.confirmPending(
        { ...callerA, userId: ownerB },
        {
          transactionId: pending.id,
          expectedUpdatedAt: edited.transaction.updatedAt,
          values: {
            kind: "expense",
            merchantName: "Synthetic Coffee",
            money: { amountMinor: "28000", currency: "IDR" },
            occurredOn: "2026-10-15",
            occurredTime: null,
            description: null,
            location: null,
            accountHint: null,
            categoryId: category.id,
            financialAccountId: account.financialAccount.id,
          },
        },
      ),
      (error) => error instanceof FinanceOperationError && error.code === "NOT_FOUND",
    );

    const confirmed = await service.confirmPending(callerA, {
      transactionId: pending.id,
      expectedUpdatedAt: edited.transaction.updatedAt,
      values: {
        kind: "expense",
        merchantName: "Synthetic Coffee",
        money: { amountMinor: "28000", currency: "IDR" },
        occurredOn: "2026-10-15",
        occurredTime: null,
        description: null,
        location: null,
        accountHint: null,
        categoryId: category.id,
        financialAccountId: account.financialAccount.id,
      },
    });
    assert.equal(confirmed.transaction.reviewStatus, "confirmed");

    const rejectedPending = memory.seedPending(ownerA, { merchantName: "Wrong Import" });
    const rejected = await service.excludePending(callerA, {
      transactionId: rejectedPending.id,
      expectedUpdatedAt: rejectedPending.updatedAt,
    });
    assert.equal(rejected.transaction.kind, "exclusion");
    assert.equal(rejected.transaction.reviewStatus, "confirmed");
    const queue = await service.listTransactions(callerA, { reviewStatus: "pending" });
    assert.equal(queue.items.length, 0);
  });
});

describe("Agent T2 confirmation simulation", () => {
  it("binds a transaction delete to its User and allows it exactly once", async () => {
    const memory = createMemoryFinanceRepository();
    let currentTime = new Date("2026-10-15T05:00:00.000Z");
    const service = createFinanceService(memory.repository, { now: () => currentTime });
    const caller = { ...callerA, channel: "whatsapp", directSource: "whatsapp_text" };
    const created = await service.addTransaction(caller, {
      clientRequestId: "confirmation-transaction",
      kind: "expense",
      merchantName: "Synthetic Coffee",
      money: { amountMinor: "28000", currency: "IDR" },
      occurredOn: "2026-10-15",
      occurredTime: null,
      description: null,
      location: null,
      accountHint: null,
      categoryId: category.id,
      financialAccountId: "40000000-0000-4000-8000-000000000004",
    });
    const confirmation = await service.requestDestructiveAction(caller, {
      action: "delete_transaction",
      input: {
        transactionId: created.transaction.id,
        expectedUpdatedAt: created.transaction.updatedAt,
      },
    });
    assert.equal(confirmation.action, "delete_transaction");
    assert.deepEqual(confirmation.resourceIds, [created.transaction.id]);
    assert.match(confirmation.summary, /Synthetic Coffee/);

    await assert.rejects(
      service.confirmDestructiveAction(
        { ...caller, userId: ownerB },
        { confirmationId: confirmation.confirmationId, answer: "yes" },
      ),
      (error) => error instanceof FinanceOperationError && error.code === "NOT_FOUND",
    );

    assert.deepEqual(
      await service.confirmDestructiveAction(caller, {
        confirmationId: confirmation.confirmationId,
        answer: "yes",
      }),
      { ok: true },
    );
    assert.equal((await service.listTransactions(caller, {})).items.length, 0);
    await assert.rejects(
      service.confirmDestructiveAction(caller, {
        confirmationId: confirmation.confirmationId,
        answer: "yes",
      }),
      (error) => error instanceof FinanceOperationError && error.code === "CONFLICT",
    );

    const expiring = await service.addTransaction(caller, {
      clientRequestId: "expired-confirmation-transaction",
      kind: "expense",
      merchantName: "Synthetic Tea",
      money: { amountMinor: "18000", currency: "IDR" },
      occurredOn: "2026-10-15",
      occurredTime: null,
      description: null,
      location: null,
      accountHint: null,
      categoryId: category.id,
      financialAccountId: "40000000-0000-4000-8000-000000000004",
    });
    const expiredConfirmation = await service.requestDestructiveAction(caller, {
      action: "delete_transaction",
      input: {
        transactionId: expiring.transaction.id,
        expectedUpdatedAt: expiring.transaction.updatedAt,
      },
    });
    currentTime = new Date("2026-10-15T05:05:00.000Z");
    await assert.rejects(
      service.confirmDestructiveAction(caller, {
        confirmationId: expiredConfirmation.confirmationId,
        answer: "yes",
      }),
      (error) => error instanceof FinanceOperationError && error.code === "CONFLICT",
    );
    assert.equal((await service.listTransactions(caller, {})).items.length, 1);
  });
});

describe("undo_action", () => {
  const coffee = (clientRequestId) => ({
    clientRequestId,
    kind: "expense",
    merchantName: "Synthetic Coffee",
    money: { amountMinor: "25000", currency: "IDR" },
    occurredOn: "2026-10-15",
    occurredTime: null,
    description: null,
    location: null,
    accountHint: null,
    categoryId: category.id,
    financialAccountId: "40000000-0000-4000-8000-000000000004",
  });
  const failsWith = (code) => (error) =>
    error instanceof FinanceOperationError && error.code === code;

  it("reverses an add or an edit once, for its own User, before it expires", async () => {
    const memory = createMemoryFinanceRepository();
    let currentTime = new Date("2026-10-15T01:00:30.000Z");
    const service = createFinanceService(memory.repository, { now: () => currentTime });
    const caller = { ...callerA, channel: "whatsapp", directSource: "whatsapp_text" };

    const added = await service.addTransaction(caller, coffee("undo-edit"));
    const edited = await service.editTransaction(caller, {
      transactionId: added.transaction.id,
      expectedUpdatedAt: added.transaction.updatedAt,
      changes: { money: { amountMinor: "28000", currency: "IDR" } },
    });
    assert.equal(edited.transaction.money.amountMinor, "28000");

    await assert.rejects(
      service.undoAction({ ...caller, userId: ownerB }, { actionId: edited.action.actionId }),
      failsWith("NOT_FOUND"),
    );
    assert.deepEqual(await service.undoAction(caller, { actionId: edited.action.actionId }), {
      ok: true,
    });
    const [restored] = (await service.listTransactions(caller, {})).items;
    assert.equal(restored.money.amountMinor, "25000");
    await assert.rejects(
      service.undoAction(caller, { actionId: edited.action.actionId }),
      failsWith("CONFLICT"),
    );

    // The edit's undo changed the record, so the add's receipt is now stale.
    await assert.rejects(
      service.undoAction(caller, { actionId: added.action.actionId }),
      failsWith("CONFLICT"),
    );

    const second = await service.addTransaction(caller, coffee("undo-add"));
    await service.undoAction(caller, { actionId: second.action.actionId });
    assert.equal((await service.listTransactions(caller, {})).items.length, 1);

    const late = await service.addTransaction(caller, coffee("undo-late"));
    currentTime = new Date("2026-10-15T01:15:00.000Z");
    await assert.rejects(
      service.undoAction(caller, { actionId: late.action.actionId }),
      failsWith("CONFLICT"),
    );
    assert.equal((await service.listTransactions(caller, {})).items.length, 2);
  });

  it("restores a Budget's previous limit and removes a Budget it created", async () => {
    const memory = createMemoryFinanceRepository();
    const service = createFinanceService(memory.repository, {
      now: () => new Date("2026-10-15T01:00:30.000Z"),
    });
    const created = await service.createBudget(callerA, {
      clientRequestId: "undo-budget",
      categoryId: category.id,
      name: "Food",
      cadence: "monthly",
      limit: { amountMinor: "1500000", currency: "IDR" },
      warningPercent: 80,
      startsOn: "2026-10-01",
    });
    const raised = await service.updateBudget(callerA, {
      budgetId: created.budget.id,
      expectedUpdatedAt: created.budget.updatedAt,
      changes: { limit: { amountMinor: "2000000", currency: "IDR" } },
    });
    // 1.3M is under the raised limit's warning line but over the restored one's.
    await service.addTransaction(callerA, {
      ...coffee("undo-budget-spend"),
      money: { amountMinor: "1300000", currency: "IDR" },
    });
    const remindersBeforeUndo = memory.state.reminderKeys.size;
    await service.undoAction(callerA, { actionId: raised.action.actionId });
    const [budgetAfterUndo] = (await service.listBudgets(callerA, {})).items;
    assert.equal(budgetAfterUndo.limit.amountMinor, "1500000");
    assert.equal(memory.state.reminderKeys.size, remindersBeforeUndo + 1);

    const other = await service.createBudget(callerA, {
      clientRequestId: "undo-budget-2",
      categoryId: category.id,
      name: "Coffee",
      cadence: "weekly",
      limit: { amountMinor: "100000", currency: "IDR" },
      warningPercent: 80,
      startsOn: "2026-10-01",
    });
    await service.undoAction(callerA, { actionId: other.action.actionId });
    assert.deepEqual(
      (await service.listBudgets(callerA, {})).items.map((item) => item.name),
      ["Food"],
    );
  });
});

describe("ZO6-ZO8 backend journey simulation", () => {
  it("runs accounts, two money directions, exclusion, dashboard, budgets, thresholds, and soft deletes", async () => {
    const memory = createMemoryFinanceRepository();
    const service = createFinanceService(memory.repository, {
      now: () => new Date("2026-10-15T05:00:00.000Z"),
    });
    const firstAccount = await service.createFinancialAccount(callerA, {
      clientRequestId: "account-main",
      name: "Main Wallet",
      institution: "Synthetic Bank",
      accountType: "wallet",
      currency: "IDR",
      lastFour: "1234",
    });
    const secondAccount = await service.createFinancialAccount(callerA, {
      clientRequestId: "account-savings",
      name: "Savings",
      institution: "Synthetic Bank",
      accountType: "bank",
      currency: "IDR",
      lastFour: "5678",
    });
    assert.equal((await service.listFinancialAccounts(callerA, {})).items.length, 2);
    assert.equal((await service.listCategories(callerA, {})).items.length, 15);

    const base = {
      occurredOn: "2026-10-15",
      occurredTime: null,
      description: null,
      location: null,
      accountHint: null,
    };
    const expense = await service.addTransaction(callerA, {
      ...base,
      clientRequestId: "expense-1",
      kind: "expense",
      merchantName: "Synthetic Grocery",
      money: { amountMinor: "800", currency: "IDR" },
      categoryId: category.id,
      financialAccountId: firstAccount.financialAccount.id,
    });
    await service.addTransaction(callerA, {
      ...base,
      clientRequestId: "income-1",
      kind: "income",
      merchantName: "Synthetic Employer",
      money: { amountMinor: "2000", currency: "IDR" },
      categoryId: null,
      financialAccountId: firstAccount.financialAccount.id,
    });
    const pendingExcluded = memory.seedPending(ownerA, {
      kind: "income",
      merchantName: "Reimbursement",
      money: { amountMinor: "500", currency: "IDR" },
      categoryId: null,
      financialAccountId: secondAccount.financialAccount.id,
    });
    const excluded = await service.excludePending(callerA, {
      transactionId: pendingExcluded.id,
      expectedUpdatedAt: pendingExcluded.updatedAt,
    });
    assert.equal(excluded.transaction.kind, "exclusion");
    assert.equal(excluded.transaction.reviewStatus, "confirmed");

    const editedExpense = await service.editTransaction(callerA, {
      transactionId: expense.transaction.id,
      expectedUpdatedAt: expense.transaction.updatedAt,
      changes: { money: { amountMinor: "900", currency: "IDR" } },
    });
    let dashboard = await service.getDashboard(callerA, { month: "2026-10" });
    assert.equal(dashboard.income.amountMinor, "2000");
    assert.equal(dashboard.spending.amountMinor, "900");
    assert.equal(dashboard.difference.amountMinor, "1100");
    assert.equal(dashboard.categoryBreakdown[0].total.amountMinor, "900");

    const createdBudget = await service.createBudget(callerA, {
      clientRequestId: "food-budget",
      categoryId: category.id,
      name: "Food & Drinks",
      cadence: "monthly",
      limit: { amountMinor: "1000", currency: "IDR" },
      startsOn: "2026-10-01",
    });
    assert.equal(createdBudget.budget.warningPercent, 80);
    assert.equal(memory.state.reminderKeys.size, 1);

    const finalExpense = await service.addTransaction(callerA, {
      ...base,
      clientRequestId: "expense-2",
      kind: "expense",
      merchantName: "Synthetic Snack",
      money: { amountMinor: "100", currency: "IDR" },
      categoryId: category.id,
      financialAccountId: firstAccount.financialAccount.id,
    });
    assert.equal(memory.state.reminderKeys.size, 2);
    const usage = await service.listBudgetUsage(callerA, { month: "2026-10" });
    assert.equal(usage[0].used.amountMinor, "1000");
    assert.equal(usage[0].state, "over");

    const raisedBudget = await service.updateBudget(callerA, {
      budgetId: createdBudget.budget.id,
      expectedUpdatedAt: createdBudget.budget.updatedAt,
      changes: { limit: { amountMinor: "1200", currency: "IDR" } },
    });
    assert.equal(memory.state.reminderKeys.size, 3);

    await service.deleteTransaction(callerA, {
      transactionId: finalExpense.transaction.id,
      expectedUpdatedAt: finalExpense.transaction.updatedAt,
    });
    assert.equal((await service.listTransactions(callerA, {})).items.length, 3);
    dashboard = await service.getDashboard(callerA, { month: "2026-10" });
    assert.equal(dashboard.spending.amountMinor, "900");

    const budgetConfirmation = await service.requestDestructiveAction(callerA, {
      action: "delete_budget",
      input: {
        budgetId: raisedBudget.budget.id,
        expectedUpdatedAt: raisedBudget.budget.updatedAt,
      },
    });
    await service.confirmDestructiveAction(callerA, {
      confirmationId: budgetConfirmation.confirmationId,
      answer: "yes",
    });
    assert.equal((await service.listBudgets(callerA, {})).items.length, 0);
    assert.ok(editedExpense.action.actionId);
  });
});

describe("budget alert hook", () => {
  it("reports each new threshold Reminder once and describes it for WhatsApp", async () => {
    const memory = createMemoryFinanceRepository();
    const reported = [];
    const service = createFinanceService(memory.repository, {
      now: () => new Date("2026-10-15T01:00:30.000Z"),
      onBudgetReminder: (input) => reported.push(input),
    });
    await service.createBudget(callerA, {
      clientRequestId: "alert-budget",
      categoryId: category.id,
      name: "Food",
      cadence: "monthly",
      limit: { amountMinor: "1000000", currency: "IDR" },
      warningPercent: 80,
      startsOn: "2026-10-01",
    });
    const spend = (clientRequestId, amountMinor) =>
      service.addTransaction(callerA, {
        clientRequestId,
        kind: "expense",
        merchantName: "Synthetic Warteg",
        money: { amountMinor, currency: "IDR" },
        occurredOn: "2026-10-15",
        occurredTime: null,
        description: null,
        location: null,
        accountHint: null,
        categoryId: category.id,
        financialAccountId: "40000000-0000-4000-8000-000000000004",
      });
    await spend("alert-1", "850000");
    await spend("alert-2", "10000");
    assert.equal(reported.length, 1, "the 80% Reminder was reported more than once");
    assert.equal(reported[0].userId, ownerA);

    assert.deepEqual(await service.describeBudgetAlert(ownerA, reported[0].reminderId), {
      budgetName: "Food",
      used: { amountMinor: "860000", currency: "IDR" },
      limit: { amountMinor: "1000000", currency: "IDR" },
      periodEndsOn: "2026-10-31",
    });
    assert.equal(await service.describeBudgetAlert(ownerB, reported[0].reminderId), null);
  });

  it("never fails a write when the hook throws", async () => {
    const memory = createMemoryFinanceRepository();
    const service = createFinanceService(memory.repository, {
      now: () => new Date("2026-10-15T01:00:30.000Z"),
      onBudgetReminder: () => {
        throw new Error("after() outside a request");
      },
    });
    const created = await service.createBudget(callerA, {
      clientRequestId: "alert-budget-throw",
      categoryId: category.id,
      name: "Food",
      cadence: "monthly",
      limit: { amountMinor: "1", currency: "IDR" },
      warningPercent: 80,
      startsOn: "2026-10-01",
    });
    assert.equal(created.budget.name, "Food");
  });
});
