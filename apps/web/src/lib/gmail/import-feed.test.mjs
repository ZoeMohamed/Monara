import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, describe, it } from "node:test";

const mailboxId = "00000000-0000-4000-8000-000000000001";
const accountId = "00000000-0000-4000-8000-000000000002";
const state = {};
globalThis.monaraImportFeedTest = state;

function reset() {
  Object.assign(state, {
    accountPages: new Map(),
    transactionPages: new Map(),
    accountCursors: [],
    transactionCursors: [],
    transactionInputs: [],
  });
}

const financeClient = `
const test = globalThis.monaraImportFeedTest;
export async function callFinanceOperation(operation, input) {
  const key = input.cursor ?? "start";
  if (operation === "list_financial_accounts") {
    test.accountCursors.push(input.cursor);
    return test.accountPages.get(key) ?? { items: [], nextCursor: null };
  }
  test.transactionInputs.push(input);
  test.transactionCursors.push(input.cursor);
  return test.transactionPages.get(key) ?? { items: [], nextCursor: null };
}
`;

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/finance/client") {
      return {
        url: `data:text/javascript,${encodeURIComponent(financeClient)}`,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});
const { loadImportFeed } = await import("./import-feed.ts");
hooks.deregister();

function account(overrides = {}) {
  return {
    id: accountId,
    name: "BCA",
    institution: "BCA",
    gmailConnectionId: mailboxId,
    ...overrides,
  };
}

function transaction(overrides = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000003",
    financialAccountId: accountId,
    source: "gmail_email",
    deletedAt: null,
    kind: "expense",
    money: { amountMinor: "25000", currency: "IDR" },
    occurredOn: "2026-10-18",
    merchantName: "Kopi",
    description: null,
    ...overrides,
  };
}

describe("Gmail onboarding import feed", () => {
  beforeEach(reset);

  it("pages accounts and scopes transactions before the feed limit", async () => {
    state.accountPages.set("start", {
      items: [account({ id: "00000000-0000-4000-8000-000000000010", gmailConnectionId: null })],
      nextCursor: "100",
    });
    state.accountPages.set("100", { items: [account()], nextCursor: null });
    state.transactionPages.set("start", { items: [transaction()], nextCursor: null });

    assert.deepEqual(await loadImportFeed(mailboxId), [
      {
        id: "00000000-0000-4000-8000-000000000003",
        provider: "BCA",
        bankName: "BCA",
        merchant: "Kopi",
        amount: 25000,
        date: "2026-10-18",
        kind: "expense",
      },
    ]);
    assert.deepEqual(state.accountCursors, [null, "100"]);
    assert.deepEqual(state.transactionCursors, [undefined]);
    assert.deepEqual(state.transactionInputs, [{ limit: 100, financialAccountIds: [accountId] }]);
  });

  it("does not read transactions when the mailbox owns no accounts", async () => {
    state.accountPages.set("start", {
      items: [account({ gmailConnectionId: null })],
      nextCursor: null,
    });

    assert.deepEqual(await loadImportFeed(mailboxId), []);
    assert.deepEqual(state.transactionCursors, []);
  });

  it("keeps deleted, incomplete, and other-source rows out of the feed", async () => {
    state.accountPages.set("start", { items: [account()], nextCursor: null });
    state.transactionPages.set("start", {
      items: [
        transaction({ deletedAt: "2026-10-18T00:00:00Z" }),
        transaction({ source: "manual" }),
        transaction({ money: null }),
      ],
      nextCursor: null,
    });

    assert.deepEqual(await loadImportFeed(mailboxId), []);
  });
});
