import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GmailIngestionError,
  isGmailIngestionOperation,
  runGmailIngestionOperation,
} from "./gmail-ingestion.ts";

const connectionId = "00000000-0000-4000-8000-000000000010";
const processedMessageId = "00000000-0000-4000-8000-000000000020";

/** Records which repository method ran and with what. */
function fakeRepository() {
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
    recordExtraction: record("recordExtraction", { transactionIds: [], alreadyFinished: false }),
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
});
