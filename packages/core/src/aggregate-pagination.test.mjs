import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createFinanceService } from "./finance.ts";
import { createSupabaseFinanceRepository } from "./supabase-finance-repository.ts";

const owner = "10000000-0000-4000-8000-000000000001";
const otherOwner = "10000000-0000-4000-8000-000000000002";
const timestamp = "2026-10-15T00:00:00.000Z";
const uuid = (sequence) => `20000000-0000-4000-8000-${sequence.toString(16).padStart(12, "0")}`;
const caller = { userId: owner, channel: "web", directSource: "manual_form" };

function rows(count = 1_001) {
  const categories = Array.from({ length: count }, (_, index) => ({
    id: uuid(index + 1),
    user_id: owner,
    name: `Category ${index + 1}`,
    slug: `category-${index + 1}`,
    icon: "palette",
    color: "#4c2a86",
    is_default: false,
    is_archived: false,
    created_at: timestamp,
    updated_at: timestamp,
  }));
  const categoryId = categories.at(-1).id;
  const budgets = Array.from({ length: count }, (_, index) => ({
    id: uuid(index + 2_000),
    user_id: owner,
    category_id: categoryId,
    name: `Budget ${index + 1}`,
    cadence: "monthly",
    limit_amount: "2000",
    currency: "IDR",
    warning_percent: 80,
    starts_on: "2026-10-01",
    is_active: index === count - 1,
    deleted_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  }));
  const transactions = Array.from({ length: count }, (_, index) => ({
    id: uuid(index + 4_000),
    user_id: owner,
    financial_account_id: uuid(6_000),
    category_id: categoryId,
    source_type: "manual_form",
    transaction_type: "expense",
    merchant_name: "Synthetic shop",
    amount: "1",
    currency: "IDR",
    occurred_on: "2026-10-14",
    occurred_time: null,
    description: null,
    location: null,
    account_hint: null,
    ai_confidence: null,
    review_status: "confirmed",
    deleted_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  }));
  return { categories, budgets, transactions, reminders: [] };
}

// Models PostgREST's configured max_rows=1000, including offset pages and ownership filters.
function pagedClient(tables, failAtOffset = null, beforeRead = () => {}) {
  const queries = [];
  return {
    queries,
    from(table) {
      const query = { table, filters: [], orders: [], offset: 0, limit: 1_000 };
      queries.push(query);
      const filter = (column, matches) => {
        query.filters.push((row) => matches(row[column]));
        return builder;
      };
      const result = Promise.resolve().then(() => {
        beforeRead(query);
        if (query.offset === failAtOffset) return { data: null, error: { code: "XX000" } };
        const ordered = tables[table]
          .filter((row) => query.filters.every((matches) => matches(row)))
          .sort((left, right) => {
            for (const { column, ascending } of query.orders) {
              if (left[column] === right[column]) continue;
              return (left[column] < right[column] ? -1 : 1) * (ascending ? 1 : -1);
            }
            return 0;
          });
        const data = ordered.slice(query.offset, query.offset + Math.min(query.limit, 1_000));
        return { data, error: null };
      });
      const builder = Object.assign(result, {
        select() {
          return this;
        },
        eq(column, value) {
          return filter(column, (candidate) => candidate === value);
        },
        in(column, values) {
          return filter(column, (candidate) => values.includes(candidate));
        },
        is(column, value) {
          return filter(column, (candidate) => candidate === value);
        },
        gte(column, value) {
          return filter(column, (candidate) => candidate >= value);
        },
        lte(column, value) {
          return filter(column, (candidate) => candidate <= value);
        },
        lt(column, value) {
          return filter(column, (candidate) => candidate < value);
        },
        order(column, options) {
          query.orders.push({ column, ascending: options.ascending });
          return this;
        },
        limit(limit) {
          query.limit = limit;
          return this;
        },
        range(first, last) {
          query.offset = first;
          query.limit = last - first + 1;
          return this;
        },
      });
      return builder;
    },
  };
}

describe("complete owned aggregate reads", () => {
  it("includes categories and budgets past 100 and transactions past the database response limit", async () => {
    const tables = rows();
    for (const table of ["categories", "budgets", "transactions"]) {
      tables[table].push({ ...tables[table][0], id: uuid(8_000), user_id: otherOwner });
    }
    const client = pagedClient(tables);
    const repository = createSupabaseFinanceRepository(client);
    assert.equal((await repository.listAllCategories(owner)).length, 1_001);
    assert.equal((await repository.listAllBudgets(owner)).length, 1_001);

    const service = createFinanceService(repository, {
      now: () => new Date("2026-10-15T12:00:00Z"),
    });
    const dashboard = await service.getDashboard(caller, { month: "2026-10" });
    assert.equal(dashboard.spending.amountMinor, "1001");
    assert.equal(dashboard.categoryBreakdown[0].categoryName, "Category 1001");
    assert.equal(dashboard.budgetUsage.length, 1);
    assert.equal(dashboard.budgetUsage[0].used.amountMinor, "1001");
    assert.equal(dashboard.budgetUsage[0].budget.name, "Budget 1001");
    for (const table of ["categories", "budgets", "transactions"]) {
      assert.ok(client.queries.some((query) => query.table === table && query.offset === 1_000));
    }
  });

  it("lets the service update a category beyond the old first-100 cutoff", async () => {
    const repository = createSupabaseFinanceRepository(pagedClient(rows()));
    let updated = false;
    const service = createFinanceService({
      ...repository,
      async updateCategory(userId, input) {
        assert.equal(userId, owner);
        updated = true;
        const previous = (await repository.listAllCategories(userId)).find(
          (category) => category.id === input.categoryId,
        );
        return { ...previous, ...input.changes };
      },
      async recordUndoAction(input) {
        assert.equal(JSON.parse(input.state.values).name, "Category 1001");
        return {
          actionId: uuid(9_000),
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          changedAt: input.changedAt,
          undoExpiresAt: input.undoExpiresAt,
        };
      },
    });
    const result = await service.updateCategory(caller, {
      categoryId: uuid(1_001),
      expectedUpdatedAt: timestamp,
      changes: { name: "Updated category" },
    });
    assert.equal(updated, true);
    assert.equal(result.category.name, "Updated category");
  });

  it("rejects a failed later page instead of returning partial aggregates", async () => {
    const repository = createSupabaseFinanceRepository(pagedClient(rows(), 1_000));
    await assert.rejects(repository.listAllCategories(owner), { code: "INTERNAL" });
    await assert.rejects(repository.listAllBudgets(owner), { code: "INTERNAL" });
    await assert.rejects(repository.listTransactionsForMonth(owner, "2026-10"), {
      code: "INTERNAL",
    });
  });

  it("refuses to double-count a transaction repeated when an insertion shifts the next page", async () => {
    const tables = rows();
    let inserted = false;
    const client = pagedClient(tables, null, (query) => {
      if (query.table !== "transactions" || query.offset !== 1_000 || inserted) return;
      inserted = true;
      tables.transactions.push({ ...tables.transactions[0], id: uuid(9_000), amount: "900" });
    });
    const service = createFinanceService(createSupabaseFinanceRepository(client), {
      now: () => new Date("2026-10-15T12:00:00Z"),
    });
    await assert.rejects(service.getDashboard(caller, { month: "2026-10" }), {
      code: "CONFLICT",
      message: "Your records changed while loading. Refresh and try again.",
    });
    assert.equal(inserted, true);
  });

  it("reads the final supported month without producing a year-10000 filter", async () => {
    const tables = rows(1);
    tables.transactions[0].occurred_on = "9999-12-31";
    const repository = createSupabaseFinanceRepository(pagedClient(tables));
    const page = await repository.listTransactions(owner, { month: "9999-12" });
    assert.equal(page.items.length, 1);
    assert.equal((await repository.listTransactionsForMonth(owner, "9999-12")).length, 1);
  });

  it("scopes a transaction page to owned financial accounts before applying its limit", async () => {
    const tables = rows(2);
    tables.transactions[1].financial_account_id = uuid(6_001);
    const repository = createSupabaseFinanceRepository(pagedClient(tables));

    const page = await repository.listTransactions(owner, {
      financialAccountIds: [uuid(6_001)],
      limit: 1,
    });

    assert.deepEqual(
      page.items.map((transaction) => transaction.id),
      [tables.transactions[1].id],
    );
  });
});
