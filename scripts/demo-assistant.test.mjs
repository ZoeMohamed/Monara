import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === "./demo-ledger" &&
      /\/data\/demo-assistant\.ts$/.test(context.parentURL ?? "")
    ) {
      return nextResolve("./demo-ledger.ts", context);
    }
    return nextResolve(specifier, context);
  },
});
const { demoReply, parseRupiah } = await import("../apps/web/src/data/demo-assistant.ts");
hooks.deregister();

const today = "2026-10-11";

function expense(overrides = {}) {
  return {
    id: "synthetic-demo-expense",
    merchant: "Synthetic cafe",
    category: "Food & Drinks",
    amount: 50000,
    currency: "IDR",
    date: today,
    time: "08:00",
    method: "Cash",
    kind: "expense",
    emoji: "✦",
    confidence: null,
    status: "confirmed",
    ...overrides,
  };
}

const budget = {
  id: "synthetic-budget",
  category: "Food & Drinks",
  emoji: "✦",
  cadence: "monthly",
  limit: 1000000,
  warningPercent: 80,
};

function context(overrides = {}) {
  return { transactions: [expense()], budgets: [budget], bills: [], today, ...overrides };
}

test("reads common Indonesian and English rupiah shorthands exactly", () => {
  assert.equal(parseRupiah("25rb"), 25000);
  assert.equal(parseRupiah("28k"), 28000);
  assert.equal(parseRupiah("1.5jt"), 1500000);
  assert.equal(parseRupiah("Rp 25.000"), 25000);
  assert.equal(parseRupiah("25000"), 25000);
  assert.equal(parseRupiah("Rp 1.250.000"), 1250000);
  assert.equal(parseRupiah("1,250,000"), 1250000);
  assert.equal(parseRupiah("1,001k"), 1001);
  assert.equal(parseRupiah("abc"), null);
  assert.equal(parseRupiah("0"), null);
});

test("ambiguous separators and fractional rupiah are never guessed or rounded", () => {
  for (const value of [
    "25.5",
    "25,5",
    "1.25.000",
    "1,250.000",
    "0.0001k",
    "1.250.000jt",
    "9007199254740992",
  ]) {
    assert.equal(parseRupiah(value), null, value);
  }
});

test("a short note ending in an amount logs a cash expense without inventing a category", () => {
  const result = demoReply("kopi 25rb", context());
  assert.deepEqual(result.log, { merchant: "Kopi", amount: 25000 });
  assert.match(result.reply, /Rp\s?25,000/);
});

test("questions never log, and affordability uses the remaining budget", () => {
  const result = demoReply("Can I afford a 300k dinner?", context());
  assert.equal(result.log, undefined);
  // Rp1,000,000 budget minus Rp50,000 spent minus Rp300,000 leaves Rp650,000.
  assert.match(result.reply, /^Yes\./);
  assert.match(result.reply, /650,000/);
  const tooMuch = demoReply("Can I afford 2jt?", context());
  assert.match(tooMuch.reply, /^Not comfortably\./);
});

test("questions without punctuation never create a demo transaction", () => {
  for (const message of [
    "can I afford 300k",
    "What did I spend 25k",
    "is dinner 300k",
    "budget 300k",
  ]) {
    assert.equal(demoReply(message, context()).log, undefined, message);
  }
  const result = demoReply("Can I afford Rp 300.000", context());
  assert.match(result.reply, /650,000/);
  const separatedUnit = demoReply("Can I afford 1.5 jt", context());
  assert.match(separatedUnit.reply, /Not comfortably/);
});

test("summary and visual requests never create a payment or claim an image was generated", () => {
  const summary = demoReply("summary 25rb", context());
  assert.equal(summary.log, undefined);
  assert.match(summary.reply, /50,000/);
  const visual = demoReply("Visualize my spending", context());
  assert.equal(visual.log, undefined);
  assert.match(visual.reply, /aren’t connected in this demo yet/);
});

test("unrecognized dates, accounts, currencies, and transaction types never become cash expenses", () => {
  for (const message of [
    "salary 9jt",
    "transfer savings 300k",
    "coffee yesterday 25k",
    "coffee BCA 25k",
    "coffee USD 25k",
    "coffee 2026-10-10 25k",
    "undo 25k",
  ]) {
    assert.equal(demoReply(message, context()).log, undefined, message);
  }
  assert.equal(demoReply("add 25k", context()).log, undefined);
});

test("multiple prices ask for a single price instead of choosing one", () => {
  const result = demoReply("Can I afford 300k or 500k?", context());
  assert.equal(result.log, undefined);
  assert.match(result.reply, /Tell me the price/);
});

test("foreign prices never become rupiah affordability answers", () => {
  for (const message of ["Can I afford 300k EUR?", "Can I afford $300?", "coffee €25"]) {
    const result = demoReply(message, context());
    assert.equal(result.log, undefined);
    assert.match(result.reply, /rupiah amount/);
  }
});

test("spending answers count confirmed expenses only", () => {
  const result = demoReply(
    "Where did my money go?",
    context({
      transactions: [
        expense(),
        expense({ id: "synthetic-pending", amount: 900000, status: "pending" }),
        expense({ id: "synthetic-income", amount: 5000000, kind: "income", category: null }),
        expense({ id: "synthetic-future", amount: 700000, date: "2026-10-12" }),
        expense({ id: "synthetic-invalid", amount: -50000 }),
      ],
    }),
  );
  assert.match(result.reply, /50,000/);
  assert.doesNotMatch(result.reply, /900,000|5,000,000|700,000|750,000/);
});

test("unknown requests explain what the demo can do instead of guessing", () => {
  const result = demoReply("transfer my savings", context());
  assert.equal(result.log, undefined);
  assert.match(result.reply, /cash payment/);
  assert.doesNotMatch(result.reply, /transferred|saved|deleted/i);
});
