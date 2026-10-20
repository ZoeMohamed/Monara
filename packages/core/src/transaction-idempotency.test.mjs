import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FinanceOperationError } from "./finance.ts";
import { createSupabaseFinanceRepository } from "./supabase-finance-repository.ts";

const userId = "10000000-0000-4000-8000-000000000001";
const otherUserId = "10000000-0000-4000-8000-000000000002";
const transactionId = "20000000-0000-4000-8000-000000000001";
const timestamp = "2026-10-15T01:00:00.000Z";
const values = {
  clientRequestId: "synthetic-transaction-retry",
  kind: "exclusion",
  flowDirection: "out",
  merchantName: "Synthetic reimbursement",
  money: { amountMinor: "25000", currency: "IDR" },
  occurredOn: "2026-10-15",
  occurredTime: null,
  description: null,
  location: null,
  accountHint: null,
  categoryId: null,
  financialAccountId: null,
};

// Models one successful insert followed by PostgREST's unique-key error and
// owner-scoped lookup. No database or external service is contacted.
function transactionClient() {
  const rows = [];
  const queries = [];
  return {
    rows,
    queries,
    from(table) {
      assert.equal(table, "transactions");
      const query = { filters: [], values: null, changes: null };
      queries.push(query);
      return {
        insert(input) {
          query.values = input;
          return this;
        },
        select() {
          return this;
        },
        update(changes) {
          query.changes = changes;
          return this;
        },
        eq(column, value) {
          query.filters.push([column, value]);
          return this;
        },
        is(column, value) {
          return this.eq(column, value);
        },
        async single() {
          if (
            rows.some(
              (row) =>
                row.user_id === query.values.user_id &&
                row.client_request_id === query.values.client_request_id,
            )
          ) {
            return { data: null, error: { code: "23505" } };
          }
          const row = {
            id: transactionId,
            ai_confidence: null,
            deleted_at: null,
            created_at: timestamp,
            updated_at: timestamp,
            ...query.values,
          };
          rows.push(row);
          return { data: row, error: null };
        },
        async maybeSingle() {
          const row = rows.find((row) =>
            query.filters.every(([column, value]) => row[column] === value),
          );
          if (row && query.changes) {
            Object.assign(
              row,
              Object.fromEntries(
                Object.entries(query.changes).filter(([, value]) => value !== undefined),
              ),
              { updated_at: "2026-10-15T01:01:00.000Z" },
            );
          }
          return {
            data: row ?? null,
            error: null,
          };
        },
      };
    },
  };
}

describe("transaction creation retries", () => {
  it("returns the original exclusion for both incoming and outgoing cash directions", async () => {
    for (const flowDirection of ["in", "out", null]) {
      const client = transactionClient();
      const repository = createSupabaseFinanceRepository(client);
      const request = {
        userId,
        source: "manual_form",
        values: { ...values, flowDirection },
      };
      const created = await repository.createTransaction(request);
      const repeated = await repository.createTransaction(request);
      assert.deepEqual(repeated, created);
      assert.equal(repeated.flowDirection, flowDirection);
      assert.equal(client.rows.length, 1);
      assert.deepEqual(client.queries.at(-1).filters, [
        ["user_id", userId],
        ["client_request_id", values.clientRequestId],
      ]);
    }
  });

  it("replays an expense or income when its optional direction was omitted", async () => {
    for (const [kind, expectedDirection] of [
      ["expense", "out"],
      ["income", "in"],
    ]) {
      const client = transactionClient();
      const repository = createSupabaseFinanceRepository(client);
      const { flowDirection: _direction, ...withoutDirection } = values;
      const request = { userId, source: "manual_form", values: { ...withoutDirection, kind } };
      await repository.createTransaction(request);
      const repeated = await repository.createTransaction(request);
      assert.equal(repeated.flowDirection, expectedDirection);
      assert.equal(client.rows.length, 1);
    }
  });

  it("rejects changing an exclusion's cash direction under an existing request ID", async () => {
    const client = transactionClient();
    const repository = createSupabaseFinanceRepository(client);
    await repository.createTransaction({ userId, source: "manual_form", values });
    await assert.rejects(
      repository.createTransaction({
        userId,
        source: "manual_form",
        values: { ...values, flowDirection: "in" },
      }),
      (error) => error instanceof FinanceOperationError && error.code === "CONFLICT",
    );
    assert.equal(client.rows[0].flow_direction, "out");
  });

  it("keeps request IDs scoped to their own User", async () => {
    const client = transactionClient();
    const repository = createSupabaseFinanceRepository(client);
    await repository.createTransaction({ userId: otherUserId, source: "manual_form", values });
    const own = await repository.createTransaction({ userId, source: "manual_form", values });
    assert.equal(own.flowDirection, "out");
    assert.equal(client.rows.length, 2);
    assert.deepEqual(
      client.rows.map((row) => row.user_id),
      [otherUserId, userId],
    );
  });

  it("clears a corrected pending date when no source date is known", async () => {
    const client = transactionClient();
    const repository = createSupabaseFinanceRepository(client);
    const pending = await repository.createPendingTransaction({
      userId,
      source: "whatsapp_receipt",
      clientRequestId: values.clientRequestId,
      confidence: 0.6,
      values,
    });
    assert.equal(pending.occurredOn, "2026-10-15");
    const corrected = await repository.replaceTransaction({
      userId,
      transactionId: pending.id,
      expectedUpdatedAt: pending.updatedAt,
      reviewStatus: "pending",
      values: { ...values, occurredOn: null },
    });
    assert.equal(corrected.occurredOn, null);
    assert.equal(corrected.reviewStatus, "pending");
    assert.equal(client.queries.at(-1).changes.occurred_on, null);
    assert.deepEqual(client.queries.at(-1).filters, [
      ["id", pending.id],
      ["user_id", userId],
      ["updated_at", pending.updatedAt],
      ["deleted_at", null],
    ]);
  });
});
