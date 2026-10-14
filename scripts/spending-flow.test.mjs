import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "./demo-ledger" && context.parentURL?.endsWith("/data/spending-flow.ts")) {
      return nextResolve("./demo-ledger.ts", context);
    }
    return nextResolve(specifier, context);
  },
});
const { spendingFlow, spendingPlaces } = await import("../apps/web/src/data/spending-flow.ts");
hooks.deregister();

function record(overrides = {}) {
  return {
    id: "synthetic-expense",
    merchant: "Synthetic place",
    category: "Digital",
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

test("flow includes only valid confirmed expenses in the selected month", () => {
  const result = spendingFlow(
    [
      record({ id: "included", amount: 12000 }),
      record({ status: "pending" }),
      record({ status: "rejected" }),
      record({ kind: "income" }),
      record({ kind: "transfer", method: "BCA → Jago" }),
      record({ amount: null }),
      record({ amount: 0 }),
      record({ amount: -100 }),
      record({ amount: 1.5 }),
      record({ currency: null }),
      record({ date: "2026-10-32" }),
      record({ date: "2026-09-30" }),
    ],
    "2026-10",
  );
  assert.equal(result.spending, 12000n);
  assert.equal(result.categories.length, 1);
  assert.deepEqual(
    result.categories[0].merchants[0].transactions.map(({ id }) => id),
    ["included"],
  );
});

test("category and place totals conserve every rupiah beyond safe-number sums", () => {
  const result = spendingFlow(
    [
      record({ id: "one", amount: Number.MAX_SAFE_INTEGER }),
      record({ id: "two", amount: Number.MAX_SAFE_INTEGER, merchant: "Second place" }),
      record({ id: "three", amount: 1, category: "Transport" }),
    ],
    "2026-10",
  );
  assert.equal(result.spending, 18014398509481983n);
  assert.equal(
    result.categories.reduce((sum, category) => sum + category.amount, 0n),
    result.spending,
  );
  for (const category of result.categories) {
    assert.equal(
      category.merchants.reduce((sum, merchant) => sum + merchant.amount, 0n),
      category.amount,
    );
    assert.equal(
      category.count,
      category.merchants.reduce((sum, merchant) => sum + merchant.transactions.length, 0),
    );
  }
});

test("missing categories and merchants remain visible without fabricated mappings", () => {
  const result = spendingFlow(
    [
      record({ id: "unassigned", category: null, merchant: null }),
      record({ id: "blank", category: "", merchant: "" }),
    ],
    "2026-10",
  );
  assert.equal(result.categories[0].name, "Uncategorized");
  assert.equal(result.categories[0].merchants[0].name, "Unassigned merchant");
  assert.equal(result.categories[0].merchants[0].amount, 20000n);
});

test("place groups stay within their category and rows retain canonical transaction identities", () => {
  const first = Object.freeze(record({ id: "one", merchant: "Same place", category: "Shopping" }));
  const second = Object.freeze(
    record({ id: "two", merchant: "Same place", category: "Transport", amount: 20000 }),
  );
  const third = Object.freeze(
    record({ id: "three", merchant: "Same place", category: "Shopping" }),
  );
  const records = Object.freeze([first, second, third]);
  const result = spendingFlow(records, "2026-10");
  assert.equal(result.categories.length, 2);
  const shopping = result.categories.find(({ name }) => name === "Shopping");
  assert.equal(shopping.merchants.length, 1);
  assert.equal(shopping.count, 2);
  assert.equal(shopping.merchants[0].transactions[0], first);
  assert.equal(shopping.merchants[0].transactions[1], third);
});

test("empty and income-only months contain no invented flows", () => {
  assert.deepEqual(spendingFlow([], "2026-10"), { spending: 0n, categories: [] });
  assert.deepEqual(spendingFlow([record({ kind: "income" })], "2026-10"), {
    spending: 0n,
    categories: [],
  });
  assert.throws(() => spendingFlow([], "2026-13"), /valid calendar month/);
});

test("top places merge cross-category expenses with exact totals and canonical records", () => {
  const first = Object.freeze(record({ id: "one", merchant: "Same place", category: "Shopping" }));
  const second = Object.freeze(
    record({ id: "two", merchant: "Same place", category: "Transport", amount: 20000 }),
  );
  const third = Object.freeze(record({ id: "three", merchant: "Other place", amount: 15000 }));
  const places = spendingPlaces(Object.freeze([first, second, third]), "2026-10");
  assert.equal(places.length, 2);
  assert.equal(places[0].name, "Same place");
  assert.equal(places[0].amount, 30000n);
  assert.equal(places[0].transactions.length, 2);
  assert.equal(
    places[0].transactions.find(({ id }) => id === "one"),
    first,
  );
  assert.equal(
    places[0].transactions.find(({ id }) => id === "two"),
    second,
  );
  assert.equal(places[1].name, "Other place");
  assert.equal(places[1].transactions[0], third);
  assert.equal(
    places.reduce((amount, place) => amount + place.amount, 0n),
    spendingFlow([first, second, third], "2026-10").spending,
  );
});

test("ranked places preserve bigint totals beyond safe-number sums and deterministic ties", () => {
  const places = spendingPlaces(
    [
      record({ merchant: "Same place", amount: Number.MAX_SAFE_INTEGER }),
      record({ merchant: "Same place", amount: Number.MAX_SAFE_INTEGER, category: "Shopping" }),
      record({ merchant: "B place", amount: 1 }),
      record({ merchant: "A place", amount: 1, status: "confirmed" }),
      record({ merchant: "Excluded", amount: Number.MAX_SAFE_INTEGER, status: "pending" }),
    ],
    "2026-10",
  );
  assert.deepEqual(
    places.map(({ name, amount }) => ({ name, amount })),
    [
      { name: "Same place", amount: 18014398509481982n },
      { name: "A place", amount: 1n },
      { name: "B place", amount: 1n },
    ],
  );
});
