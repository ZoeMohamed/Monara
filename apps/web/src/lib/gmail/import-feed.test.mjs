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
    fetchers: [],
  });
}

const financeClient = `
const test = globalThis.monaraImportFeedTest;
export async function callFinanceOperation(operation, input, fetcher) {
  const key = input.cursor ?? "start";
  test.fetchers.push(fetcher);
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
    createdAt: "2026-10-18T10:00:00Z",
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
    assert.deepEqual(state.transactionCursors, [null]);
    assert.deepEqual(state.transactionInputs, [
      { limit: 100, cursor: null, financialAccountIds: [accountId] },
    ]);
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

  it("continues past ineligible pages until it finds feed rows", async () => {
    state.accountPages.set("start", { items: [account()], nextCursor: null });
    state.transactionPages.set("start", {
      items: [transaction({ source: "manual_form" })],
      nextCursor: "100",
    });
    state.transactionPages.set("100", {
      items: [transaction()],
      nextCursor: null,
    });

    assert.equal((await loadImportFeed(mailboxId)).length, 1);
    assert.deepEqual(state.transactionCursors, [null, "100"]);
  });

  it("partitions account filters at the contract limit", async () => {
    const accounts = Array.from({ length: 101 }, (_, index) =>
      account({ id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}` }),
    );
    state.accountPages.set("start", { items: accounts, nextCursor: null });

    assert.deepEqual(await loadImportFeed(mailboxId), []);
    assert.deepEqual(
      state.transactionInputs.map((input) => input.financialAccountIds.length),
      [100, 1],
    );
  });

  it("combines cancellation with the finance request timeout", async () => {
    state.accountPages.set("start", { items: [account()], nextCursor: null });
    const pageController = new AbortController();
    await loadImportFeed(mailboxId, pageController.signal);
    const timeoutController = new AbortController();
    const originalFetch = globalThis.fetch;
    let receivedSignal;
    globalThis.fetch = async (_input, init) => {
      receivedSignal = init.signal;
      return new Response();
    };
    try {
      await state.fetchers[0]("/test", { signal: timeoutController.signal });
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.notEqual(receivedSignal, pageController.signal);
    assert.notEqual(receivedSignal, timeoutController.signal);
    assert.equal(receivedSignal.aborted, false);
    pageController.abort();
    assert.equal(receivedSignal.aborted, true);
  });
});
