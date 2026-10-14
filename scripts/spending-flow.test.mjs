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
const { biggestExpenses, spendingFlow, spendingPlaces } = await import(
  "../apps/web/src/data/spending-flow.ts"
);
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

test("owned flow categories retain UUID identity through duplicate names and renames", () => {
  const firstId = "00000000-0000-4000-8000-000000000201";
  const secondId = "00000000-0000-4000-8000-000000000202";
  const first = record({ id: "first", categoryId: firstId, category: "Dining", amount: 100 });
  const renamed = record({ id: "renamed", categoryId: firstId, category: "Food", amount: 200 });
  const second = record({ id: "second", categoryId: secondId, category: "Dining", amount: 400 });
  const result = spendingFlow([first, renamed, second], "2026-10");
  assert.equal(result.spending, 700n);
  assert.equal(result.categories.length, 2);
  const firstGroup = result.categories.find(({ categoryId }) => categoryId === firstId);
  const secondGroup = result.categories.find(({ categoryId }) => categoryId === secondId);
  assert.equal(firstGroup.name, "Dining");
  assert.equal(firstGroup.amount, 300n);
  assert.equal(firstGroup.count, 2);
  assert.deepEqual(firstGroup.merchants[0].transactions, [first, renamed]);
  assert.equal(secondGroup.name, "Dining");
  assert.equal(secondGroup.amount, 400n);
  assert.equal(secondGroup.count, 1);
  assert.deepEqual(secondGroup.merchants[0].transactions, [second]);
  // Top places deliberately combine the same merchant across category identities.
  const places = spendingPlaces([first, renamed, second], "2026-10");
  assert.equal(places.length, 1);
  assert.equal(places[0].amount, 700n);
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

test("biggest expenses rank individual payments separately from a place's total", () => {
  const first = Object.freeze(record({ id: "first", merchant: "Frequent place", amount: 12000 }));
  const second = Object.freeze(record({ id: "second", merchant: "Frequent place", amount: 12000 }));
  const largest = Object.freeze(record({ id: "largest", merchant: "One payment", amount: 18000 }));
  const records = Object.freeze([first, second, largest]);
  assert.equal(spendingPlaces(records, "2026-10")[0].name, "Frequent place");
  assert.equal(spendingPlaces(records, "2026-10")[0].amount, 24000n);
  assert.equal(biggestExpenses(records, "2026-10")[0], largest);
  assert.deepEqual(biggestExpenses(records, "2026-10"), [largest, first, second]);
  assert.deepEqual(records, [first, second, largest]);
});

test("single-payment ranking excludes unconfirmed, incomplete, income, transfer and other months", () => {
  const valid = record({ id: "valid", amount: Number.MAX_SAFE_INTEGER });
  const records = [
    record({ status: "pending" }),
    record({ status: "rejected" }),
    record({ amount: null }),
    record({ currency: null }),
    record({ date: "2026-10-32" }),
    record({ kind: "income" }),
    record({ kind: "transfer", method: "BCA → Jago" }),
    record({ date: "2026-09-30" }),
    record({ id: "smaller", amount: Number.MAX_SAFE_INTEGER - 1 }),
    valid,
  ];
  assert.deepEqual(
    biggestExpenses(records, "2026-10").map(({ id }) => id),
    ["valid", "smaller"],
  );
  assert.equal(biggestExpenses(records, "2026-10")[0], valid);
});

test("same-size payments use latest date and time, then record identity for stable order", () => {
  const records = [
    record({ id: "later-id", date: "2026-10-01" }),
    record({ id: "first-id", date: "2026-10-01" }),
    record({ id: "latest-day", date: "2026-10-03", time: null }),
    record({ id: "later-time", date: "2026-10-01", time: "18:15" }),
  ];
  assert.deepEqual(
    biggestExpenses(records, "2026-10").map(({ id }) => id),
    ["latest-day", "later-time", "first-id", "later-id"],
  );
});
