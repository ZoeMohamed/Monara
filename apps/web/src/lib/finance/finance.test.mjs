import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { transactionErrors } from "../../data/demo-ledger.ts";
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
    fromFinancialAccountId: null,
    toFinancialAccountId: null,
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

  it("maps arbitrary owned transfer pairs without treating account names as identity", () => {
    const mapped = mapOwnedTransaction(
      record({
        kind: "transfer",
        financialAccountId: null,
        fromFinancialAccountId: accountId,
        toFinancialAccountId: secondAccountId,
      }),
      accounts,
      categories,
    );
    assert.equal(mapped.method, "Same display name → Savings");
    assert.equal(mapped.backend.fromFinancialAccountId, accountId);
    assert.equal(mapped.backend.toFinancialAccountId, secondAccountId);
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

  it("permits unassigned imported expenses without weakening transfer validation", () => {
    const imported = mapOwnedTransaction(
      record({ financialAccountId: null, reviewStatus: "confirmed" }),
      accounts,
      categories,
    );
    assert.equal(imported.method, null);
    assert.deepEqual(transactionErrors(imported), {});
    const transfer = mapOwnedTransaction(
      record({ kind: "transfer", financialAccountId: null }),
      accounts,
      categories,
    );
    assert.match(transactionErrors(transfer).method, /source and destination/);
  });

  it("loads every page, excludes rejected/deleted records, and never inserts samples", async () => {
    const cursors = [];
    const read = emptyReader(async (input) => {
      cursors.push(input.cursor);
      return input.cursor === null
        ? { items: [record()], nextCursor: "next-page" }
        : {
            items: [
              record({ id: "00000000-0000-4000-8000-000000000302", reviewStatus: "rejected" }),
              record({ id: "00000000-0000-4000-8000-000000000303", deletedAt: timestamp }),
            ],
            nextCursor: null,
          };
    });
    const snapshot = await loadFinanceSnapshot(read, "2026-10", "2026-10-14");
    assert.deepEqual(cursors, [null, "next-page"]);
    assert.equal(snapshot.transactions.length, 1);
    assert.equal(snapshot.transactions[0].backend.id, transactionId);
    assert.equal(snapshot.today, "2026-10-14");
    assert.deepEqual((await loadFinanceSnapshot(emptyReader(), "2026-10")).transactions, []);
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
        assert.deepEqual(JSON.parse(options.body), input);
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
      callFinanceOperation("reject_pending", { transactionId }, async () => {
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
        "reject_pending",
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
    ]) {
      await assert.rejects(
        callFinanceOperation(
          "reject_pending",
          { transactionId, expectedUpdatedAt: timestamp },
          fetcher,
        ),
        (error) => error instanceof FinanceClientError && error.actionMayHaveCompleted === true,
      );
    }
  });
});
