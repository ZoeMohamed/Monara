import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GmailIngestionError,
  isGmailIngestionOperation,
  runGmailIngestionOperation,
} from "./gmail-ingestion.ts";

const connectionId = "00000000-0000-4000-8000-000000000010";
const processedMessageId = "00000000-0000-4000-8000-000000000020";
const userId = "00000000-0000-4000-8000-000000000001";
const transactionId = "00000000-0000-4000-8000-000000000030";

/** Records which repository method ran and with what. */
function fakeRepository(recorded = {}, categoryResult = {}) {
  const calls = [];
  const record = (name, result) => async (input) => {
    calls.push({ name, input });
    return result;
  };
  return {
    calls,
    listActiveConnections: record("listActiveConnections", { connections: [] }),
    resolveConnection: record("resolveConnection", { connectionId }),
    claimMessage: record("claimMessage", { processedMessageId, alreadyFinished: false }),
    recordExtraction: record("recordExtraction", {
      transactionIds: [],
      alreadyFinished: false,
      uncategorizedTransactionIds: [],
      userId,
      confirmedTransactionIds: [],
      ...recorded,
    }),
    startSync: record("startSync", undefined),
    claimMessages: record("claimMessages", { pending: 0 }),
    failSync: record("failSync", undefined),
    setImportedCategory: record("setImportedCategory", {
      applied: true,
      userId,
      confirmed: true,
      ...categoryResult,
    }),
    markSynced: record("markSynced", undefined),
    markError: record("markError", undefined),
    syncCounts: record("syncCounts", undefined),
  };
}

describe("runGmailIngestionOperation", () => {
  it("knows only the agreed operation names", () => {
    assert.equal(isGmailIngestionOperation("claim-message"), true);
    assert.equal(isGmailIngestionOperation("gmail.claim-message"), false);
    assert.equal(isGmailIngestionOperation("add_transaction"), false);
  });

  it("validates input before touching the repository", async () => {
    const repository = fakeRepository();
    await assert.rejects(
      runGmailIngestionOperation(repository, "claim-message", {
        connectionId,
        gmailMessageId: "m1",
        receivedAt: "yesterday",
      }),
      (error) => error instanceof GmailIngestionError && error.code === "VALIDATION_FAILED",
    );
    // A caller-supplied User id is never accepted.
    await assert.rejects(
      runGmailIngestionOperation(repository, "resolve-connection", {
        connectionId,
        userId: "00000000-0000-4000-8000-000000000001",
      }),
      { code: "VALIDATION_FAILED" },
    );
    assert.deepEqual(repository.calls, []);
  });

  it("rejects items on a skipped outcome", async () => {
    const repository = fakeRepository();
    await assert.rejects(
      runGmailIngestionOperation(repository, "record-extraction", {
        processedMessageId,
        outcome: "skipped",
        items: [{}],
      }),
      { code: "VALIDATION_FAILED" },
    );
  });

  it("dispatches parsed input and returns empty objects for writes", async () => {
    const repository = fakeRepository();
    const result = await runGmailIngestionOperation(repository, "report-connection-error", {
      connectionId,
      reason: "authorization_lost",
    });
    assert.deepEqual(result, {});
    assert.deepEqual(repository.calls, [{ name: "markError", input: connectionId }]);
  });

  const extracted = {
    kind: "expense",
    merchantName: "Kopi Contoh",
    money: { amountMinor: "25000", currency: "IDR" },
    occurredOn: "2026-10-12",
    occurredTime: null,
    description: null,
    location: null,
    accountHint: "BCA ****4242",
    accountLastFour: "4242",
    confidence: 0.95,
  };
  const recordInput = {
    processedMessageId,
    outcome: "transactions",
    items: [extracted],
    institutionKey: "BCA_CC",
    senderVerified: true,
  };

  it("follows up on auto-confirmed items and returns only the contract fields", async () => {
    const repository = fakeRepository({
      transactionIds: [transactionId],
      confirmedTransactionIds: [transactionId],
    });
    const confirmed = [];
    const result = await runGmailIngestionOperation(repository, "record-extraction", recordInput, {
      onTransactionsConfirmed: async (owner, ids) => {
        confirmed.push({ owner, ids });
      },
    });
    assert.deepEqual(result, {
      transactionIds: [transactionId],
      alreadyFinished: false,
      uncategorizedTransactionIds: [],
    });
    assert.deepEqual(confirmed, [{ owner: userId, ids: [transactionId] }]);
  });

  it("passes display normalization alongside unchanged source evidence and rejects oversized labels", async () => {
    const repository = fakeRepository();
    const item = {
      ...extracted,
      merchantName: "PT MEDIA DOKTER INVESTAMA / HALODOC",
      counterpartyName: "PT MEDIA DOKTER INVESTAMA / HALODOC",
      normalizedDisplayName: "Halodoc (PT Media Dokter Investama)",
    };
    await runGmailIngestionOperation(repository, "record-extraction", {
      ...recordInput,
      items: [item],
    });
    const recorded = repository.calls[0].input.items[0];
    assert.equal(recorded.normalizedDisplayName, item.normalizedDisplayName);
    assert.equal(recorded.merchantName, item.merchantName);
    assert.equal(recorded.counterpartyName, item.counterpartyName);
    await assert.rejects(
      runGmailIngestionOperation(repository, "record-extraction", {
        ...recordInput,
        items: [{ ...item, normalizedDisplayName: "X".repeat(81) }],
      }),
      { code: "VALIDATION_FAILED" },
    );
    assert.equal(repository.calls.length, 1);
  });

  it("never repeats the follow-up for an already recorded message", async () => {
    const repository = fakeRepository({
      transactionIds: [transactionId],
      alreadyFinished: true,
      confirmedTransactionIds: [transactionId],
    });
    let called = false;
    await runGmailIngestionOperation(repository, "record-extraction", recordInput, {
      onTransactionsConfirmed: async () => {
        called = true;
      },
    });
    assert.equal(called, false);
  });

  it("records a parse job's results in order, following up each new one once", async () => {
    const second = "00000000-0000-4000-8000-000000000021";
    const repository = fakeRepository();
    const outcomes = new Map([
      [
        processedMessageId,
        { transactionIds: [transactionId], confirmedTransactionIds: [transactionId] },
      ],
      [second, { alreadyFinished: true, confirmedTransactionIds: ["ignored"] }],
    ]);
    repository.recordExtraction = async (input) => {
      repository.calls.push({ name: "recordExtraction", input: input.processedMessageId });
      return {
        transactionIds: [],
        alreadyFinished: false,
        uncategorizedTransactionIds: [],
        userId,
        confirmedTransactionIds: [],
        ...outcomes.get(input.processedMessageId),
      };
    };
    const followUps = [];
    const result = await runGmailIngestionOperation(
      repository,
      "record-extractions",
      {
        results: [
          recordInput,
          {
            processedMessageId: second,
            outcome: "skipped",
            items: [],
            institutionKey: null,
            senderVerified: false,
          },
        ],
      },
      { onTransactionsConfirmed: async (owner, ids) => void followUps.push({ owner, ids }) },
    );
    assert.deepEqual(result, {
      results: [
        {
          transactionIds: [transactionId],
          alreadyFinished: false,
          uncategorizedTransactionIds: [],
        },
        { transactionIds: [], alreadyFinished: true, uncategorizedTransactionIds: [] },
      ],
    });
    assert.deepEqual(
      repository.calls.map((call) => call.input),
      [processedMessageId, second],
    );
    assert.deepEqual(followUps, [{ owner: userId, ids: [transactionId] }]);
  });

  it("rejects an empty or oversized parse batch before recording anything", async () => {
    const repository = fakeRepository();
    for (const results of [[], Array.from({ length: 11 }, () => recordInput)]) {
      await assert.rejects(
        runGmailIngestionOperation(repository, "record-extractions", { results }),
        { code: "VALIDATION_FAILED" },
      );
    }
    assert.deepEqual(repository.calls, []);
  });

  it("records an agent sync failure only with a known reason", async () => {
    const repository = fakeRepository();
    assert.deepEqual(
      await runGmailIngestionOperation(repository, "report-sync-failure", {
        connectionId,
        reason: "gmail_unavailable",
      }),
      {},
    );
    assert.deepEqual(repository.calls, [
      { name: "failSync", input: { connectionId, error: "gmail_unavailable" } },
    ]);
    // Only the web backend may report that the agent itself could not be reached.
    await assert.rejects(
      runGmailIngestionOperation(repository, "report-sync-failure", {
        connectionId,
        reason: "agent_unavailable",
      }),
      { code: "VALIDATION_FAILED" },
    );
  });

  it("checks budgets again when categorization fills a confirmed transaction", async () => {
    for (const [result, expected] of [
      [{}, [{ owner: userId, ids: [transactionId] }]],
      [{ confirmed: false }, []],
      [{ applied: false }, []],
    ]) {
      const repository = fakeRepository({}, result);
      const followUps = [];
      assert.deepEqual(
        await runGmailIngestionOperation(
          repository,
          "set-imported-category",
          { transactionId, categoryName: "Food" },
          { onTransactionsConfirmed: async (owner, ids) => void followUps.push({ owner, ids }) },
        ),
        { applied: result.applied ?? true },
      );
      assert.deepEqual(followUps, expected);
    }
  });
});

describe("typed Gmail categorization boundary", () => {
  it("passes an unknown-type category hint and nullable score without confirming it", async () => {
    const repository = fakeRepository({}, { confirmed: false });
    const hooks = [];
    const input = {
      transactionId,
      categoryId: "00000000-0000-4000-8000-000000000040",
      kind: null,
      confidence: null,
    };
    assert.deepEqual(
      await runGmailIngestionOperation(repository, "set-imported-category", input, {
        onTransactionsConfirmed: async (...args) => hooks.push(args),
      }),
      { applied: true },
    );
    assert.deepEqual(repository.calls, [{ name: "setImportedCategory", input }]);
    assert.deepEqual(hooks, []);
  });

  it("validates the activity guard without loading extraction context", async () => {
    const calls = [];
    const repository = { checkConnectionActive: async (id) => calls.push(id) };
    assert.deepEqual(
      await runGmailIngestionOperation(repository, "check-connection-active", { connectionId }),
      {},
    );
    assert.deepEqual(calls, [connectionId]);
    await assert.rejects(
      runGmailIngestionOperation(repository, "check-connection-active", { connectionId, userId }),
      { code: "VALIDATION_FAILED" },
    );
    assert.deepEqual(calls, [connectionId]);
  });
  it("passes an uncertain terminal outcome without triggering financial hooks", async () => {
    const repository = fakeRepository({}, { confirmed: false });
    const hooks = [];
    const input = { transactionId, categoryId: null, kind: null, confidence: null };
    assert.deepEqual(
      await runGmailIngestionOperation(repository, "set-imported-category", input, {
        onTransactionsConfirmed: async (...args) => hooks.push(args),
      }),
      { applied: true },
    );
    assert.deepEqual(repository.calls, [{ name: "setImportedCategory", input }]);
    assert.deepEqual(hooks, []);
    await assert.rejects(
      runGmailIngestionOperation(repository, "set-imported-category", {
        ...input,
        kind: "expense",
      }),
      { code: "VALIDATION_FAILED" },
    );
    assert.equal(repository.calls.length, 1);
  });
});
