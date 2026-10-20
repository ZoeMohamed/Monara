import assert from "node:assert/strict";
import test from "node:test";
import { demoSummary, transactionErrors } from "../apps/web/src/data/demo-ledger.ts";
import {
  demoEditorCategories,
  demoTransactionSelection,
  initialDemoAccounts,
} from "../apps/web/src/data/demo-resources.ts";
import { categorySchema, financialAccountSchema } from "../packages/contracts/src/ledger.ts";

test("demo accounts retain explicit types and distinct UUIDs instead of relying on bank nicknames", () => {
  const accounts = initialDemoAccounts();
  assert.equal(new Set(accounts.map(({ id }) => id)).size, accounts.length);
  for (const account of accounts)
    assert.equal(financialAccountSchema.parse(account).id, account.id);
  assert.equal(accounts.find(({ name }) => name === "ShopeePay").accountType, "wallet");
  assert.equal(accounts.find(({ name }) => name === "Cash").institution, null);
});

test("custom demo categories join editor choices beyond four and retain the chosen symbol", () => {
  const categories = demoEditorCategories([{ category: "Pets", icon: "heart" }]);
  assert.ok(categories.length > 4);
  assert.equal(categories.find(({ name }) => name === "Pets").icon, "heart");
  for (const category of categories) categorySchema.parse(category);
  assert.equal(new Set(categories.map(({ id }) => id)).size, categories.length);
});

test("new wallet transactions resolve one payment method and Category", () => {
  const accounts = initialDemoAccounts();
  const wallet = {
    ...accounts[1],
    id: "a0000000-0000-4000-8000-000000000099",
    name: "Daily wallet",
    institution: "OVO",
  };
  const resources = {
    financialAccounts: [...accounts, wallet],
    categories: demoEditorCategories([]),
  };
  const selections = demoTransactionSelection(
    {
      kind: "expense",
      method: wallet.id,
      category: resources.categories[0].id,
    },
    resources,
  );
  assert.equal(selections.method, "Daily wallet");
  assert.equal(selections.financialAccountId, wallet.id);
  assert.equal(selections.category, resources.categories[0].name);
  assert.equal(selections.categoryIcon, resources.categories[0].icon);
  const expense = {
    ...selections,
    id: "expense",
    merchant: "Lunch",
    kind: "expense",
    amount: 10000,
    date: "2026-10-15",
    time: null,
    currency: "IDR",
    status: "confirmed",
    emoji: "•",
    confidence: null,
  };
  assert.equal(demoSummary([expense], "2026-10").spending, 10000n);
  assert.equal(demoSummary([expense], "2026-10").income, 0n);
  assert.deepEqual(
    transactionErrors({
      ...selections,
      merchant: "Lunch",
      kind: "expense",
      amount: 10000,
      date: "2026-10-15",
      time: null,
      currency: "IDR",
    }),
    {},
  );
  const invalid = demoTransactionSelection(
    {
      kind: "income",
      method: "unknown",
      category: null,
    },
    resources,
  );
  assert.equal(invalid.method, null);
  assert.equal(invalid.financialAccountId, null);
});

test("exclusion reasons keep one account and stay out of totals", () => {
  const resources = {
    financialAccounts: initialDemoAccounts(),
    categories: demoEditorCategories([]),
  };
  const reason = resources.categories.find(({ name }) => name === "Internal");
  const selection = demoTransactionSelection(
    { kind: "exclusion", method: resources.financialAccounts[0].id, category: reason.id },
    resources,
  );
  assert.equal(selection.category, "Internal");
  assert.equal(selection.categoryIcon, "internal");
  assert.equal(selection.financialAccountId, resources.financialAccounts[0].id);
  const item = {
    ...selection,
    id: "excluded",
    merchant: "Move to savings",
    kind: "exclusion",
    amount: 250000,
    date: "2026-10-15",
    time: null,
    currency: "IDR",
    status: "confirmed",
    emoji: "⊘",
    confidence: null,
  };
  assert.deepEqual(transactionErrors(item), {});
  const summary = demoSummary([item], "2026-10");
  assert.equal(summary.spending, 0n);
  assert.equal(summary.income, 0n);
  assert.equal(summary.confirmed.length, 0);
});
