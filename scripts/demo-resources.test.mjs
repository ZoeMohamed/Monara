import assert from "node:assert/strict";
import test from "node:test";
import { demoSummary, transactionErrors } from "../apps/web/src/data/demo-ledger.ts";
import {
  demoEditorCategories,
  demoTransactionSelection,
  demoTransferSelection,
  initialDemoAccounts,
} from "../apps/web/src/data/demo-resources.ts";
import { categorySchema, financialAccountSchema } from "../packages/contracts/src/ledger.ts";

test("demo accounts retain explicit types and distinct UUIDs instead of relying on bank nicknames", () => {
  const accounts = initialDemoAccounts();
  assert.equal(new Set(accounts.map(({ id }) => id)).size, accounts.length);
  for (const account of accounts)
    assert.equal(financialAccountSchema.parse(account).id, account.id);
  assert.equal(accounts.find(({ name }) => name === "GoPay").accountType, "wallet");
  assert.equal(accounts.find(({ name }) => name === "Cash").institution, null);
});

test("custom demo categories join editor choices beyond four and retain the chosen symbol", () => {
  const categories = demoEditorCategories([{ category: "Pets", icon: "heart" }]);
  assert.ok(categories.length > 4);
  assert.equal(categories.find(({ name }) => name === "Pets").icon, "heart");
  for (const category of categories) categorySchema.parse(category);
  assert.equal(new Set(categories.map(({ id }) => id)).size, categories.length);
});

test("new wallet transfers use selected identities, preserve labels and never count as spending", () => {
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
      kind: "transfer",
      method: null,
      category: null,
      fromAccount: accounts[0].id,
      toAccount: wallet.id,
    },
    resources,
  );
  assert.equal(selections.method, "BCA → Daily wallet");
  assert.equal(selections.fromFinancialAccountId, accounts[0].id);
  assert.equal(selections.toFinancialAccountId, wallet.id);
  assert.equal(selections.financialAccountId, null);
  const transfer = {
    ...selections,
    id: "transfer",
    merchant: "Move money",
    kind: "transfer",
    amount: 10000,
    date: "2026-10-15",
    time: null,
    currency: "IDR",
    status: "confirmed",
    emoji: "•",
    confidence: null,
  };
  assert.equal(demoSummary([transfer], "2026-10").spending, 0n);
  assert.equal(demoSummary([transfer], "2026-10").income, 0n);
  assert.deepEqual(
    transactionErrors({
      ...selections,
      merchant: "Move money",
      kind: "transfer",
      amount: 10000,
      date: "2026-10-15",
      time: null,
      currency: "IDR",
    }),
    {},
  );
  assert.deepEqual(demoTransferSelection(resources.financialAccounts, selections.method), {
    from: accounts[0].id,
    to: wallet.id,
  });
  const invalid = demoTransactionSelection(
    {
      kind: "transfer",
      method: null,
      category: null,
      fromAccount: accounts[0].id,
      toAccount: "unknown",
    },
    resources,
  );
  assert.equal(invalid.method, null);
  assert.equal(invalid.toFinancialAccountId, null);
  assert.ok(
    transactionErrors({
      ...invalid,
      merchant: "Move money",
      kind: "transfer",
      amount: 10000,
      date: "2026-10-15",
      time: null,
      currency: "IDR",
    }).method,
  );
});

test("ambiguous demo transfer labels never select a guessed account", () => {
  const accounts = initialDemoAccounts();
  assert.deepEqual(
    demoTransferSelection([...accounts, { ...accounts[0], id: "another-bca" }], "BCA → Jago"),
    { from: null, to: null },
  );
});
