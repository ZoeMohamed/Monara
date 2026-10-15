import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFinanceService, FinanceOperationError } from "./finance.ts";
import { createSupabaseFinanceRepository } from "./supabase-finance-repository.ts";

const owner = "10000000-0000-4000-8000-000000000001";
const otherOwner = "10000000-0000-4000-8000-000000000002";
const requestId = "20000000-0000-4000-8000-00000000000a";
const timestamp = "2026-10-15T00:00:00.000Z";
const input = { name: "Hobbies", icon: "palette", color: "#4c2a86", clientRequestId: requestId };
const caller = { userId: owner, channel: "web" };
const conflict = (error) => error instanceof FinanceOperationError && error.code === "CONFLICT";

// Simulates PostgREST's primary-key collision and owner-filtered lookup, not a live DB.
function categoryClient(rows = new Map(), errors = {}) {
  const queries = [];
  return {
    rows,
    queries,
    from(table) {
      assert.equal(table, "categories");
      const query = { table, filters: [], values: null };
      queries.push(query);
      return {
        insert(values) {
          query.values = values;
          return this;
        },
        select(columns) {
          query.columns = columns;
          return this;
        },
        eq(column, value) {
          query.filters.push([column, value]);
          return this;
        },
        async single() {
          if (errors.insert) return { data: null, error: { code: errors.insert } };
          if (rows.has(query.values.id)) return { data: null, error: { code: "23505" } };
          const row = { ...query.values, created_at: timestamp, updated_at: timestamp };
          rows.set(row.id, row);
          return { data: row, error: null };
        },
        async maybeSingle() {
          if (errors.lookup) return { data: null, error: { code: errors.lookup } };
          const row = [...rows.values()].find((candidate) =>
            query.filters.every(([column, value]) => candidate[column] === value),
          );
          return { data: row ?? null, error: null };
        },
      };
    },
  };
}

function existing(overrides = {}) {
  return {
    id: requestId,
    user_id: owner,
    name: input.name,
    slug: `custom-${requestId}`,
    icon: input.icon,
    color: input.color,
    is_default: false,
    is_archived: false,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  };
}

describe("owned category creation", () => {
  it("uses the verified caller, validates before writing and returns no reversible receipt", async () => {
    const client = categoryClient();
    const service = createFinanceService(createSupabaseFinanceRepository(client));
    const result = await service.createCategory(caller, { ...input, name: "  Hobbies  " });
    assert.deepEqual(Object.keys(result), ["category"]);
    assert.equal(result.category.id, requestId);
    assert.equal(result.category.name, "Hobbies");
    assert.equal(result.category.isDefault, false);
    assert.deepEqual(client.queries[0].values, {
      id: requestId,
      user_id: owner,
      name: "Hobbies",
      slug: `custom-${requestId}`,
      icon: "palette",
      color: "#4c2a86",
      is_default: false,
      is_archived: false,
    });
    const writes = client.queries.length;
    for (const invalid of [
      { ...input, userId: otherOwner },
      { ...input, slug: "caller-slug" },
      { ...input, isDefault: true },
      { ...input, name: " " },
      { ...input, name: "x".repeat(101) },
      { ...input, icon: " " },
      { ...input, color: "purple" },
      { ...input, clientRequestId: "not-a-uuid" },
    ])
      await assert.rejects(service.createCategory(caller, invalid));
    await assert.rejects(service.createCategory({ ...caller, userId: "invalid" }, input));
    assert.equal(client.queries.length, writes);
  });

  it("retries the same request without duplication, with an owner-scoped lookup", async () => {
    const client = categoryClient();
    const repository = createSupabaseFinanceRepository(client);
    const first = await repository.createCategory(owner, input);
    const retry = await repository.createCategory(owner, input);
    assert.deepEqual(retry, first);
    assert.equal(client.rows.size, 1);
    assert.deepEqual(client.queries.at(-1).filters, [
      ["id", requestId],
      ["user_id", owner],
    ]);
  });

  it("canonicalizes UUID case for the database-compatible generated slug", async () => {
    const client = categoryClient();
    const repository = createSupabaseFinanceRepository(client);
    const result = await repository.createCategory(owner, {
      ...input,
      clientRequestId: requestId.toUpperCase(),
    });
    assert.equal(result.id, requestId);
    assert.equal(result.slug, `custom-${requestId}`);
    assert.deepEqual(await repository.createCategory(owner, input), result);
  });

  it("rejects request reuse after any field changes or the category is archived", async () => {
    for (const changes of [
      { name: "Other name" },
      { icon: "house" },
      { color: "#ffffff" },
      { is_archived: true },
      { is_default: true },
      { slug: "other-slug" },
    ]) {
      const row = existing(changes);
      const client = categoryClient(new Map([[requestId, row]]));
      const repository = createSupabaseFinanceRepository(client);
      await assert.rejects(repository.createCategory(owner, input), conflict);
      assert.deepEqual(client.rows.get(requestId), row);
    }
  });

  it("does not expose or update a different owner's category when its ID collides", async () => {
    const row = existing({ user_id: otherOwner, name: "Private other-owner label" });
    const client = categoryClient(new Map([[requestId, row]]));
    const repository = createSupabaseFinanceRepository(client);
    await assert.rejects(repository.createCategory(owner, input), (error) => {
      assert.equal(conflict(error), true);
      assert.doesNotMatch(error.message, /Private|other-owner/);
      return true;
    });
    assert.deepEqual(client.queries.at(-1).filters, [
      ["id", requestId],
      ["user_id", owner],
    ]);
    assert.deepEqual(client.rows.get(requestId), row);
  });

  it("allows separate categories with the same display name without slug collision", async () => {
    const client = categoryClient();
    const repository = createSupabaseFinanceRepository(client);
    const first = await repository.createCategory(owner, input);
    const second = await repository.createCategory(owner, {
      ...input,
      clientRequestId: "20000000-0000-4000-8000-00000000000b",
    });
    assert.equal(first.name, second.name);
    assert.notEqual(first.slug, second.slug);
    assert.equal(client.rows.size, 2);
  });

  it("fails explicitly on database errors rather than returning a fake created category", async () => {
    for (const [databaseCode, code] of [
      ["23503", "FORBIDDEN"],
      ["23514", "VALIDATION_FAILED"],
      ["XX000", "INTERNAL"],
    ]) {
      const repository = createSupabaseFinanceRepository(
        categoryClient(new Map(), { insert: databaseCode }),
      );
      await assert.rejects(repository.createCategory(owner, input), (error) => error.code === code);
    }
    const repository = createSupabaseFinanceRepository(
      categoryClient(new Map([[requestId, existing()]]), { lookup: "XX000" }),
    );
    await assert.rejects(
      repository.createCategory(owner, input),
      (error) => error.code === "INTERNAL",
    );
  });
});
