import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { budgetUsage, transactionErrors } from "../../data/demo-ledger.ts";
import { callFinanceOperation, FinanceClientError } from "./client.ts";
import {
  FinancePresentationError,
  loadFinanceSnapshot,
  mapOwnedTransaction,
  parseDraftAmount,
  safePresentationAmount,
} from "./presentation.ts";

const accountId = "00000000-0000-4000-8000-000000000101";
const secondAccountId = "00000000-0000-4000-8000-000000000102";
const categoryId = "00000000-0000-4000-8000-000000000201";
const transactionId = "00000000-0000-4000-8000-000000000301";
const timestamp = "2026-10-14T10:00:00Z";
const budgetId = "00000000-0000-4000-8000-000000000401";

const accounts = [accountId, secondAccountId].map((id, index) => ({
  id,
  name: index === 0 ? "Same display name" : "Savings",
  institution: null,
  accountType: "bank",
  currency: "IDR",
  lastFour: null,
  institutionKey: null,
  isActive: true,
  createdAt: timestamp,
  updatedAt: timestamp,
}));
const categories = [
  {
    id: categoryId,
    name: "Food",
    slug: "food",
    icon: "food",
    color: "#0b33fd",
    isDefault: true,
    isArchived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];

function record(overrides = {}) {
  return {
    id: transactionId,
    kind: "expense",
    merchantName: "Synthetic merchant",
    money: { amountMinor: "28000", currency: "IDR" },
    occurredOn: "2026-10-14",
    occurredTime: null,
    description: null,
    location: null,
    accountHint: null,
    categoryId,
    financialAccountId: accountId,
    reviewStatus: "pending",
    source: "gmail_email",
    confidence: 0.94,
    deletedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function budget(overrides = {}) {
  return {
    id: budgetId,
    categoryId,
    name: "Food budget",
    cadence: "weekly",
    limit: { amountMinor: "700000", currency: "IDR" },
    warningPercent: 80,
    startsOn: "2026-10-01",
    isActive: true,
    deletedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function action(resourceType, resourceId) {
  return {
    actionId: "00000000-0000-4000-8000-000000000501",
    resourceType,
    resourceId,
    changedAt: timestamp,
    undoExpiresAt: "2026-10-14T10:30:00Z",
  };
}

const emptyDashboard = {
  month: "2026-10",
  income: { amountMinor: "0", currency: "IDR" },
  spending: { amountMinor: "0", currency: "IDR" },
  difference: { amountMinor: "0", currency: "IDR" },
  remainingBudget: { amountMinor: "0", currency: "IDR" },
  pace: {
    asOf: "2026-10-14",
    elapsedDays: 14,
    daysInMonth: 31,
    averageDailySpending: { amountMinor: "0", currency: "IDR" },
    projectedSpending: { amountMinor: "0", currency: "IDR" },
  },
  categoryBreakdown: [],
  budgetUsage: [],
  insights: {
    asOf: "2026-10-14",
    savingsRate: {
      income: { amountMinor: "0", currency: "IDR" },
      spending: { amountMinor: "0", currency: "IDR" },
      difference: { amountMinor: "0", currency: "IDR" },
      ratePercent: null,
    },
    safeToSpend: { overall: null, byCategory: [] },
    overspendForecasts: [],
    unusualTransactions: [],
  },
  recentTransactions: [],
  activeReminders: [],
};

function emptyReader(transactionReader = async () => ({ items: [], nextCursor: null })) {
  return async (operation, input) => {
    if (operation === "get_dashboard") return emptyDashboard;
    if (operation === "list_financial_accounts") return { items: accounts, nextCursor: null };
    if (operation === "list_categories") return { items: categories, nextCursor: null };
    if (operation === "list_transactions") return transactionReader(input);
    return { items: [], nextCursor: null };
  };
}

describe("owned financial presentation", () => {
  it("keeps owned references, versions, source, and confidence while preserving uncertainty", () => {
    const backend = record({ money: null, occurredOn: null, categoryId: null });
    const mapped = mapOwnedTransaction(backend, accounts, categories);
    assert.equal(mapped.backend, backend);
    assert.equal(mapped.amount, null);
    assert.equal(mapped.date, null);
    assert.equal(mapped.category, null);
    assert.equal(mapped.confidence, 94);
    assert.equal(mapped.method, "Same display name");
    assert.equal(mapped.status, "pending");
  });

  it("allows Gmail expense review without inventing an account or requiring a Category", () => {
    const mapped = mapOwnedTransaction(
      record({ financialAccountId: null, categoryId: null }),
      accounts,
      categories,
    );
    assert.deepEqual(transactionErrors(mapped), {});
  });

  it("maps an exclusion record with one owned Account/payment method", () => {
    const mapped = mapOwnedTransaction(
      record({
        kind: "exclusion",
        reviewStatus: "confirmed",
        categoryId: null,
        financialAccountId: secondAccountId,
      }),
      accounts,
      categories,
    );
    assert.equal(mapped.method, "Savings");
    assert.equal(mapped.backend.financialAccountId, secondAccountId);
    assert.throws(() => mapOwnedTransaction(record(), [], categories), FinancePresentationError);
  });

  it("rejects values outside the view's range rather than rounding financial amounts", () => {
    assert.equal(safePresentationAmount("9007199254740991"), Number.MAX_SAFE_INTEGER);
    assert.throws(() => safePresentationAmount("9007199254740992"), FinancePresentationError);
    assert.throws(
      () =>
        mapOwnedTransaction(
          record({ money: { amountMinor: "99999999999999999999", currency: "IDR" } }),
          accounts,
          categories,
        ),
      FinancePresentationError,
    );
  });

  it("parses draft money exactly before numeric conversion, preserving missing amounts", () => {
    assert.equal(parseDraftAmount(""), null);
    assert.equal(parseDraftAmount("  "), null);
    assert.equal(parseDraftAmount(" 00028000 "), 28000);
    assert.equal(parseDraftAmount("9007199254740991"), Number.MAX_SAFE_INTEGER);
    for (const amount of ["9007199254740990.5", "9007199254740992", "1e3", "-1", "NaN"]) {
      assert.throws(() => parseDraftAmount(amount), FinancePresentationError);
    }
  });

  it("permits unassigned imported transactions without inventing an Account", () => {
    const imported = mapOwnedTransaction(
      record({ financialAccountId: null, reviewStatus: "confirmed" }),
      accounts,
      categories,
    );
    assert.equal(imported.method, null);
    assert.deepEqual(transactionErrors(imported), {});
    const excluded = mapOwnedTransaction(
      record({
        kind: "exclusion",
        reviewStatus: "confirmed",
        financialAccountId: null,
        categoryId: null,
      }),
      accounts,
      categories,
    );
    assert.equal(excluded.method, null);
    assert.deepEqual(transactionErrors(excluded), {});
  });

  it("loads every page, retains exclusion audit records, drops deleted rows, and never inserts samples", async () => {
    const cursors = [];
    const read = emptyReader(async (input) => {
      cursors.push(input.cursor);
      return input.cursor === null
        ? { items: [record()], nextCursor: "next-page" }
        : {
            items: [
              record({
                id: "00000000-0000-4000-8000-000000000302",
                kind: "exclusion",
                reviewStatus: "confirmed",
              }),
              record({ id: "00000000-0000-4000-8000-000000000303", deletedAt: timestamp }),
            ],
            nextCursor: null,
          };
    });
    const snapshot = await loadFinanceSnapshot(read, "2026-10", "2026-10-14");
    assert.deepEqual(cursors, [null, "next-page"]);
    assert.equal(snapshot.transactions.length, 2);
    assert.equal(snapshot.transactions[0].backend.id, transactionId);
    assert.equal(snapshot.transactions[1].kind, "exclusion");
    assert.equal(snapshot.transactions[1].status, "confirmed");
    assert.equal(snapshot.today, "2026-10-14");
    assert.deepEqual((await loadFinanceSnapshot(emptyReader(), "2026-10")).transactions, []);
  });

  it("keeps server-computed payday usage and period dates instead of recalculating calendar spending", async () => {
    const monthly = budget({ cadence: "monthly", startsOn: "2026-09-25" });
    const usage = {
      budget: monthly,
      periodStartsOn: "2026-09-25",
      periodEndsOn: "2026-10-24",
      used: { amountMinor: "123456", currency: "IDR" },
      remaining: { amountMinor: "576544", currency: "IDR" },
      usagePercent: 17.63657142857143,
      state: "on_track",
    };
    const base = emptyReader(async () => ({
      items: [record({ reviewStatus: "confirmed" })],
      nextCursor: null,
    }));
    const snapshot = await loadFinanceSnapshot(
      async (operation, input) =>
        operation === "get_dashboard"
          ? { ...emptyDashboard, budgetUsage: [usage] }
          : operation === "list_budgets"
            ? { items: [monthly], nextCursor: null }
            : base(operation, input),
      "2026-10",
      "2026-10-14",
    );
    const shown = budgetUsage(snapshot.transactions, snapshot.budgets[0], "2026-10", "2026-10-14");
    assert.equal(shown.used, 123456n);
    assert.equal(shown.remaining, 576544n);
    assert.equal(shown.periodStartsOn, "2026-09-25");
    assert.equal(shown.periodEndsOn, "2026-10-24");
  });

  it("rejects cursor loops, changing pages, and malformed results instead of displaying partial totals", async () => {
    await assert.rejects(
      loadFinanceSnapshot(
        emptyReader(async () => ({ items: [], nextCursor: "loop" })),
        "2026-10",
      ),
      FinancePresentationError,
    );
    await assert.rejects(
      loadFinanceSnapshot(
        emptyReader(async (input) => ({
          items: [record()],
          nextCursor: input.cursor === null ? "next" : null,
        })),
        "2026-10",
      ),
      FinancePresentationError,
    );
    await assert.rejects(
      loadFinanceSnapshot(
        emptyReader(async () => ({ items: [record({ id: "bad-id" })], nextCursor: null })),
        "2026-10",
      ),
    );
  });
});

describe("financial HTTP boundary", () => {
  it("blocks an already offline save before dispatch so it can be retried without an uncertain result", async () => {
    const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { onLine: false },
    });
    let requests = 0;
    try {
      await assert.rejects(
        callFinanceOperation(
          "exclude_pending",
          {
            transactionId,
            expectedUpdatedAt: timestamp,
          },
          async () => {
            requests += 1;
            return Response.json({});
          },
        ),
        (error) => {
          assert.equal(error.actionMayHaveCompleted, false);
          assert.match(error.message, /hasn't been sent/);
          return true;
        },
      );
      assert.equal(requests, 0);
    } finally {
      if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
      else Reflect.deleteProperty(globalThis, "navigator");
    }
  });

  it("gives failed reads a retry path without suggesting an uncertain financial write", async () => {
    for (const fetcher of [
      async () => {
        throw new TypeError("Connection dropped");
      },
      async () => new Response("not-json", { status: 503 }),
      async () => Response.json({ not: "a transaction page" }),
    ]) {
      await assert.rejects(callFinanceOperation("list_transactions", {}, fetcher), (error) => {
        assert.equal(error.actionMayHaveCompleted, false);
        assert.match(error.message, /Refresh your records/);
        assert.doesNotMatch(error.message, /whether your change was saved/);
        return true;
      });
    }
  });

  it("undoes only the server-issued action receipt through the private financial boundary", async () => {
    const actionId = "00000000-0000-4000-8000-000000000501";
    const result = await callFinanceOperation(
      "undo_action",
      { actionId },
      async (path, options) => {
        assert.equal(path, "/api/finance/operations/undo_action");
        assert.equal(options.credentials, "same-origin");
        assert.equal(options.cache, "no-store");
        assert.deepEqual(JSON.parse(options.body), { actionId });
        return Response.json({ ok: true });
      },
    );
    assert.deepEqual(result, { ok: true });
    let requests = 0;
    for (const input of [{ actionId: "invalid" }, { actionId, userId: accountId }]) {
      await assert.rejects(
        callFinanceOperation("undo_action", input, async () => {
          requests += 1;
          return Response.json({ ok: true });
        }),
        (error) => error.code === "VALIDATION_FAILED" && !error.actionMayHaveCompleted,
      );
    }
    assert.equal(requests, 0);
  });

  it("requires recovery for a lost or invalid Undo response and preserves a definite expired receipt", async () => {
    const input = { actionId: "00000000-0000-4000-8000-000000000501" };
    for (const fetcher of [
      async () => {
        throw new TypeError("Connection dropped");
      },
      async () => Response.json({ ok: false }),
      async () => Response.json({ ok: true, ignoredWrite: true }),
    ]) {
      await assert.rejects(
        callFinanceOperation("undo_action", input, fetcher),
        (error) => error instanceof FinanceClientError && error.actionMayHaveCompleted,
      );
    }
    await assert.rejects(
      callFinanceOperation("undo_action", input, async () =>
        Response.json(
          {
            code: "CONFLICT",
            message: "That change can no longer be undone.",
            requestId: null,
          },
          { status: 409 },
        ),
      ),
      (error) => error.code === "CONFLICT" && !error.actionMayHaveCompleted,
    );
  });

  it("treats a validated Budget suggestion as a read-only operation", async () => {
    const input = { categoryId, cadence: "monthly" };
    const suggestion = {
      ...input,
      proposedLimit: { amountMinor: "300000", currency: "IDR" },
      basedOnStartsOn: "2026-07-01",
      basedOnEndsOn: "2026-09-30",
      confirmedIncome: { amountMinor: "9000000", currency: "IDR" },
      confirmedSpending: { amountMinor: "900000", currency: "IDR" },
    };
    const result = await callFinanceOperation("suggest_budget", input, async (path, options) => {
      assert.equal(path, "/api/finance/operations/suggest_budget");
      assert.deepEqual(JSON.parse(options.body), input);
      return Response.json(suggestion);
    });
    assert.deepEqual(result, suggestion);
    await assert.rejects(
      callFinanceOperation("suggest_budget", input, async () => {
        throw new TypeError("network");
      }),
      (error) => error instanceof FinanceClientError && !error.actionMayHaveCompleted,
    );
  });

  it("validates owned notification read state and round-trips persisted read receipts", async () => {
    const reminderId = "00000000-0000-4000-8000-000000000601";
    const saved = {
      id: reminderId,
      kind: "budget_threshold",
      status: "read",
      budgetId,
      thresholdPercent: 80,
      title: "Synthetic budget",
      message: "Budget threshold reached.",
      dedupeKey: "synthetic-owned-notification",
      scheduledFor: timestamp,
      readAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    let calls = 0;
    const read = await callFinanceOperation(
      "mark_reminder_read",
      { reminderId, expectedStatus: "unread" },
      async (path, options) => {
        calls += 1;
        assert.equal(path, "/api/finance/operations/mark_reminder_read");
        assert.equal(options.cache, "no-store");
        assert.equal(options.credentials, "same-origin");
        assert.deepEqual(JSON.parse(options.body), { reminderId, expectedStatus: "unread" });
        return Response.json(saved);
      },
    );
    assert.equal(read.readAt, timestamp);
    await assert.rejects(
      callFinanceOperation(
        "mark_reminder_read",
        { reminderId, expectedStatus: "unread", userId: accountId },
        () => {
          calls += 1;
          throw new Error("Not called");
        },
      ),
      { code: "VALIDATION_FAILED" },
    );
    assert.equal(calls, 1);
    await assert.rejects(
      callFinanceOperation(
        "mark_reminder_read",
        { reminderId, expectedStatus: "unread" },
        async () => Response.json({ ...saved, readAt: null }),
      ),
      (error) => error instanceof FinanceClientError && error.actionMayHaveCompleted,
    );
    const archived = await callFinanceOperation(
      "dismiss_reminder",
      { reminderId, expectedStatus: "read" },
      async () => Response.json({ ...saved, status: "dismissed" }),
    );
    assert.equal(archived.status, "dismissed");
    assert.equal(archived.readAt, timestamp);
  });
  it("creates a category with its retry UUID and no unsupported Undo receipt", async () => {
    const input = {
      name: "  Hobbies  ",
      icon: "palette",
      color: "#4c2a86",
      clientRequestId: categoryId,
    };
    const saved = {
      ...categories[0],
      id: categoryId,
      name: "Hobbies",
      icon: "palette",
      color: "#4c2a86",
      slug: `custom-${categoryId}`,
      isDefault: false,
    };
    const result = await callFinanceOperation("create_category", input, async (path, options) => {
      assert.equal(path, "/api/finance/operations/create_category");
      assert.equal(options.credentials, "same-origin");
      assert.equal(options.cache, "no-store");
      assert.deepEqual(JSON.parse(options.body), { ...input, name: "Hobbies" });
      return Response.json({ category: saved });
    });
    assert.deepEqual(result, { category: saved });
  });

  it("rejects invalid category creation before transport and preserves uncertain-write recovery", async () => {
    const input = {
      name: "Hobbies",
      icon: "palette",
      color: "#4c2a86",
      clientRequestId: categoryId,
    };
    let calls = 0;
    for (const invalid of [
      { ...input, clientRequestId: "not-a-uuid" },
      { ...input, userId: accountId },
      { ...input, name: " " },
      { ...input, icon: "" },
      { ...input, color: "red" },
    ]) {
      await assert.rejects(
        callFinanceOperation("create_category", invalid, async () => {
          calls += 1;
          return Response.json({});
        }),
        (error) => error.code === "VALIDATION_FAILED" && !error.actionMayHaveCompleted,
      );
    }
    assert.equal(calls, 0);
    await assert.rejects(
      callFinanceOperation("create_category", input, async () => {
        throw new TypeError("network");
      }),
      (error) => error.actionMayHaveCompleted,
    );
  });

  it("renames an owned category using its canonical id and reviewed version", async () => {
    const input = {
      categoryId,
      expectedUpdatedAt: timestamp,
      changes: { name: "  Everyday food  " },
    };
    const saved = { ...categories[0], name: "Everyday food", updatedAt: "2026-10-14T10:01:00Z" };
    const result = await callFinanceOperation("update_category", input, async (path, options) => {
      assert.equal(path, "/api/finance/operations/update_category");
      assert.equal(options.method, "POST");
      assert.equal(options.credentials, "same-origin");
      assert.equal(options.cache, "no-store");
      assert.deepEqual(JSON.parse(options.body), {
        categoryId,
        expectedUpdatedAt: timestamp,
        changes: { name: "Everyday food" },
      });
      return Response.json({ category: saved, action: action("category", categoryId) });
    });
    assert.deepEqual(result.category, saved);
  });

  it("rejects invalid category renames before transport and treats lost mutation replies as uncertain", async () => {
    let calls = 0;
    const input = { categoryId, expectedUpdatedAt: timestamp, changes: { name: "Everyday food" } };
    const fetcher = async () => {
      calls += 1;
      return Response.json({ category: categories[0], action: action("category", categoryId) });
    };
    for (const invalid of [
      { ...input, changes: { name: " " } },
      { ...input, changes: { name: "a".repeat(101) } },
      { ...input, expectedUpdatedAt: "missing" },
      { ...input, userId: crypto.randomUUID() },
    ]) {
      await assert.rejects(callFinanceOperation("update_category", invalid, fetcher), (error) => {
        assert.equal(error.code, "VALIDATION_FAILED");
        assert.equal(error.actionMayHaveCompleted, false);
        return true;
      });
    }
    assert.equal(calls, 0);
    for (const unavailable of [
      async () => {
        throw new TypeError("network");
      },
      async () => Response.json({ category: categories[0] }),
    ]) {
      await assert.rejects(callFinanceOperation("update_category", input, unavailable), (error) => {
        assert.equal(error.actionMayHaveCompleted, true);
        assert.match(error.message, /Refresh your records/);
        return true;
      });
    }
  });

  it("keeps budget money exact through the shared transport range and preserves create keys", async () => {
    const saved = budget({ limit: { amountMinor: "99999999999999999999", currency: "IDR" } });
    const input = {
      categoryId,
      name: saved.name,
      cadence: saved.cadence,
      limit: saved.limit,
      startsOn: saved.startsOn,
      clientRequestId: "stable-budget-create",
    };
    const payloads = [];
    const fetcher = async (path, options) => {
      assert.equal(path, "/api/finance/operations/create_budget");
      payloads.push(JSON.parse(options.body));
      return Response.json({ budget: saved, action: action("budget", budgetId) });
    };
    for (let retry = 0; retry < 2; retry += 1) {
      const result = await callFinanceOperation("create_budget", input, fetcher);
      assert.equal(result.budget.limit.amountMinor, "99999999999999999999");
    }
    assert.deepEqual(payloads[0], payloads[1]);
    assert.equal(payloads[0].clientRequestId, "stable-budget-create");
    assert.equal(payloads[0].warningPercent, 80);
  });

  it("preserves explicit weekly periods and exact equality without interpreting over as excess", async () => {
    const saved = budget();
    const usage = {
      budget: saved,
      periodStartsOn: "2026-10-08",
      periodEndsOn: "2026-10-14",
      used: saved.limit,
      remaining: { amountMinor: "0", currency: "IDR" },
      usagePercent: 100,
      state: "over",
    };
    const result = await callFinanceOperation(
      "list_budget_usage",
      { month: "2026-10" },
      async (path, options) => {
        assert.equal(path, "/api/finance/operations/list_budget_usage");
        assert.deepEqual(JSON.parse(options.body), { month: "2026-10" });
        return Response.json([usage]);
      },
    );
    assert.equal(result[0].periodStartsOn, "2026-10-08");
    assert.equal(result[0].periodEndsOn, "2026-10-14");
    assert.equal(BigInt(result[0].used.amountMinor), BigInt(result[0].budget.limit.amountMinor));
  });

  it("sends the reviewed version for budget edits and deletions", async () => {
    const saved = budget();
    await callFinanceOperation(
      "edit_budget",
      { budgetId, expectedUpdatedAt: timestamp, changes: { isActive: false } },
      async (path, options) => {
        assert.equal(path, "/api/finance/operations/edit_budget");
        assert.deepEqual(JSON.parse(options.body), {
          budgetId,
          expectedUpdatedAt: timestamp,
          changes: { isActive: false },
        });
        return Response.json({
          budget: { ...saved, isActive: false },
          action: action("budget", budgetId),
        });
      },
    );
    const deleted = await callFinanceOperation(
      "delete_budget",
      { budgetId, expectedUpdatedAt: timestamp },
      async (path, options) => {
        assert.equal(path, "/api/finance/operations/delete_budget");
        assert.deepEqual(JSON.parse(options.body), { budgetId, expectedUpdatedAt: timestamp });
        return Response.json({ ...saved, deletedAt: timestamp });
      },
    );
    assert.equal(deleted.deletedAt, timestamp);
  });

  it("creates accounts with owned server response identity, preserving optional unknown details", async () => {
    const input = {
      name: "My cash",
      institution: null,
      accountType: "cash",
      currency: "IDR",
      lastFour: null,
      clientRequestId: "stable-first-account",
    };
    const saved = { ...accounts[0], name: input.name, accountType: "cash" };
    const result = await callFinanceOperation(
      "create_financial_account",
      input,
      async (path, options) => {
        assert.equal(path, "/api/finance/operations/create_financial_account");
        // The client fills the optional Gmail institution with its default, none.
        assert.deepEqual(JSON.parse(options.body), { ...input, institutionKey: null });
        return Response.json({
          financialAccount: saved,
          action: action("financial_account", accountId),
        });
      },
    );
    assert.equal(result.financialAccount.id, accountId);
    assert.equal(result.financialAccount.institution, null);
    assert.equal(result.financialAccount.lastFour, null);
  });

  it("updates accounts with the reviewed version and preserves their identity", async () => {
    const input = {
      financialAccountId: accountId,
      expectedUpdatedAt: timestamp,
      changes: { name: "Daily wallet", institution: "GoPay", accountType: "wallet" },
    };
    const result = await callFinanceOperation(
      "update_financial_account",
      input,
      async (path, options) => {
        assert.equal(path, "/api/finance/operations/update_financial_account");
        assert.deepEqual(JSON.parse(options.body), input);
        return Response.json({
          financialAccount: { ...accounts[0], ...input.changes },
          action: action("financial_account", accountId),
        });
      },
    );
    assert.equal(result.financialAccount.id, accountId);
    assert.equal(result.financialAccount.name, "Daily wallet");
    assert.equal(result.financialAccount.accountType, "wallet");
  });

  it("deactivates an account without deleting its record", async () => {
    const result = await callFinanceOperation(
      "update_financial_account",
      {
        financialAccountId: accountId,
        expectedUpdatedAt: timestamp,
        changes: { isActive: false },
      },
      async (path, options) => {
        assert.equal(path, "/api/finance/operations/update_financial_account");
        assert.deepEqual(JSON.parse(options.body).changes, { isActive: false });
        return Response.json({
          financialAccount: { ...accounts[0], isActive: false },
          action: action("financial_account", accountId),
        });
      },
    );
    assert.equal(result.financialAccount.id, accountId);
    assert.equal(result.financialAccount.isActive, false);
  });

  it("keeps decimal-string money exact and uses the private cookie request boundary", async () => {
    const huge = record({ money: { amountMinor: "99999999999999999999", currency: "IDR" } });
    const response = await callFinanceOperation("list_transactions", {}, async (path, options) => {
      assert.equal(path, "/api/finance/operations/list_transactions");
      assert.equal(options.credentials, "same-origin");
      assert.equal(options.cache, "no-store");
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), { limit: 50 });
      return Response.json({ items: [huge], nextCursor: null });
    });
    assert.equal(response.items[0].money.amountMinor, "99999999999999999999");
  });

  it("rejects invalid input before issuing a request", async () => {
    let requests = 0;
    await assert.rejects(
      callFinanceOperation("exclude_pending", { transactionId }, async () => {
        requests += 1;
        return Response.json({});
      }),
      (error) => error instanceof FinanceClientError && error.code === "VALIDATION_FAILED",
    );
    assert.equal(requests, 0);
  });

  it("preserves nested field errors from preflight validation without making a request", async () => {
    let requested = false;
    await assert.rejects(
      callFinanceOperation(
        "edit_pending",
        { transactionId, expectedUpdatedAt: timestamp, changes: { merchantName: "x".repeat(201) } },
        async () => {
          requested = true;
          return Response.json({});
        },
      ),
      (error) =>
        error instanceof FinanceClientError &&
        error.code === "VALIDATION_FAILED" &&
        error.actionMayHaveCompleted === false &&
        error.fieldErrors["changes.merchantName"].length === 1,
    );
    assert.equal(requested, false);
  });

  it("preserves stale-conflict and field errors without claiming a write completed", async () => {
    await assert.rejects(
      callFinanceOperation(
        "exclude_pending",
        { transactionId, expectedUpdatedAt: timestamp },
        async () =>
          Response.json(
            {
              code: "CONFLICT",
              message: "This record changed.",
              requestId: null,
              fieldErrors: { expectedUpdatedAt: ["Reload the record."] },
            },
            { status: 409 },
          ),
      ),
      (error) =>
        error instanceof FinanceClientError &&
        error.code === "CONFLICT" &&
        error.actionMayHaveCompleted === false &&
        error.fieldErrors.expectedUpdatedAt[0] === "Reload the record.",
    );
  });

  it("treats dropped or malformed mutation responses as uncertain, and never fabricates success", async () => {
    for (const fetcher of [
      async () => {
        throw new TypeError("Connection dropped");
      },
      async () => Response.json({ transaction: {} }),
      async () => new Response("not-json", { status: 502 }),
      async () =>
        Response.json(
          { code: "INTERNAL", message: "The operation could not be completed.", requestId: null },
          { status: 500 },
        ),
    ]) {
      await assert.rejects(
        callFinanceOperation(
          "exclude_pending",
          { transactionId, expectedUpdatedAt: timestamp },
          fetcher,
        ),
        (error) =>
          error instanceof FinanceClientError &&
          error.actionMayHaveCompleted === true &&
          /Refresh your records/.test(error.message),
      );
    }
  });
});
