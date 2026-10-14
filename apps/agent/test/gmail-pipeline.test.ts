import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  ClaimGmailMessageInput,
  GmailExtractionJob,
  GmailJob,
  GmailSyncJob,
  MarkGmailConnectionSyncedInput,
  RecordGmailExtractionInput,
  ReportGmailConnectionErrorInput,
} from "@monara/contracts";
import {
  type ComposioGmailReader,
  type GmailMessagePage,
  GmailReadError,
} from "@monara/integrations";
import { BackendOperationError, type GmailBackend } from "../src/gmail/backend.ts";
import type { LlmClient } from "../src/gmail/llm.ts";
import { createGmailPipeline } from "../src/gmail/pipeline.ts";

const connectionId = "00000000-0000-4000-8000-000000000010";
const processedMessageId = "00000000-0000-4000-8000-000000000020";
const receivedAt = "2026-10-12T03:15:00.000Z";
const now = new Date("2026-10-13T00:00:00.000Z");

// Synthetic model output for a one-item receipt.
const receipt = {
  isTransactionEmail: true,
  items: [
    {
      kind: "expense",
      amountText: "Rp 25.000",
      currency: "IDR",
      occurredOn: "2026-10-12",
      occurredTime: null,
      merchantName: "Kopi Contoh",
      description: null,
      location: null,
      accountHint: null,
      categoryName: "food & drink",
      confidence: 0.8,
    },
  ],
};

interface Overrides {
  inactive?: boolean;
  alreadyFinished?: boolean;
  readFails?: boolean;
  /** HTTP status Composio answers a read with. */
  readStatus?: number;
  /** What Composio says about the connected account; "throws" for a failed check. */
  accountUsable?: boolean | "throws";
  llmOutput?: unknown;
  page?: GmailMessagePage;
}

/** Fake backend, reader and model that record every call the pipeline makes. */
function setup(overrides: Overrides = {}) {
  const calls = {
    claim: [] as ClaimGmailMessageInput[],
    record: [] as RecordGmailExtractionInput[],
    synced: [] as MarkGmailConnectionSyncedInput[],
    enqueued: [] as GmailJob[],
    fetched: [] as string[],
    listed: [] as { query: string; pageToken?: string | null }[],
    reported: [] as ReportGmailConnectionErrorInput[],
  };
  const backend: GmailBackend = {
    async listActiveConnections() {
      return { connections: [{ connectionId, lastSyncedAt: "2026-10-12T00:00:00.000Z" }] };
    },
    async resolveConnection(id) {
      if (overrides.inactive) {
        throw new BackendOperationError("gmail.resolve-connection", 404, "NOT_FOUND");
      }
      return {
        connectionId: id,
        userId: "00000000-0000-4000-8000-000000000001",
        composioConnectedAccountId: "ca_1",
        categoryNames: ["Food & Drink", "Transport"],
      };
    },
    async claimMessage(input) {
      calls.claim.push(input);
      return { processedMessageId, alreadyFinished: overrides.alreadyFinished ?? false };
    },
    async recordExtraction(input) {
      calls.record.push(input);
      return { transactionIds: [], alreadyFinished: false };
    },
    async markSynced(input) {
      calls.synced.push(input);
    },
    async reportConnectionError(input) {
      calls.reported.push(input);
    },
  };
  const reader: ComposioGmailReader = {
    async isConnectionUsable() {
      if (overrides.accountUsable === "throws") throw new GmailReadError("check failed", 401);
      return overrides.accountUsable ?? true;
    },
    async listMessages(_mailbox, input) {
      calls.listed.push(input);
      if (overrides.readStatus) throw new GmailReadError("list failed", overrides.readStatus);
      return overrides.page ?? { messages: [{ id: "m1", receivedAt }], nextPageToken: null };
    },
    async getMessage(_mailbox, id) {
      calls.fetched.push(id);
      if (overrides.readStatus) throw new GmailReadError("read failed", overrides.readStatus);
      if (overrides.readFails) throw new Error("read failed");
      return { id, receivedAt, from: null, subject: "Struk", text: "Total Rp 25.000", html: null };
    },
  };
  const llm: LlmClient = {
    async completeJson() {
      return overrides.llmOutput ?? receipt;
    },
  };
  const pipeline = createGmailPipeline({
    backend,
    reader,
    llm,
    enqueue: async (jobs) => {
      calls.enqueued.push(...jobs);
    },
    now: () => now,
  });
  return { pipeline, calls };
}

const extractJob: GmailExtractionJob = {
  kind: "gmail.extract",
  connectionId,
  gmailMessageId: "m1",
  receivedAt,
};
const notFinal = { isFinalAttempt: false };

describe("processMessage", () => {
  it("claims, extracts and records the items", async () => {
    const { pipeline, calls } = setup();
    assert.equal(await pipeline.runJob(extractJob, notFinal), "transactions");
    assert.deepEqual(calls.claim, [{ connectionId, gmailMessageId: "m1", receivedAt }]);
    assert.equal(calls.record[0]?.outcome, "transactions");
    assert.equal(calls.record[0]?.items[0]?.money?.amountMinor, "25000");
    // The User's own category list reaches the extractor, in the User's spelling.
    assert.equal(calls.record[0]?.items[0]?.categoryName, "Food & Drink");
  });

  it("stops before reading a message that is already finished", async () => {
    const { pipeline, calls } = setup({ alreadyFinished: true });
    assert.equal(await pipeline.runJob(extractJob, notFinal), "already_finished");
    assert.deepEqual(calls.fetched, []);
    assert.deepEqual(calls.record, []);
  });

  it("drops the job when the connection is no longer active", async () => {
    const { pipeline, calls } = setup({ inactive: true });
    assert.equal(await pipeline.runJob(extractJob, notFinal), "connection_inactive");
    assert.deepEqual(calls.claim, []);
  });

  it("records a non-transaction email as skipped", async () => {
    const { pipeline, calls } = setup({ llmOutput: { isTransactionEmail: false, items: [] } });
    assert.equal(await pipeline.runJob(extractJob, notFinal), "skipped");
    assert.deepEqual(calls.record, [{ processedMessageId, outcome: "skipped", items: [] }]);
  });

  it("reads the timestamp from the message when the listing had none", async () => {
    const { pipeline, calls } = setup();
    await pipeline.runJob({ ...extractJob, receivedAt: null }, notFinal);
    assert.equal(calls.claim[0]?.receivedAt, receivedAt);
    assert.deepEqual(calls.fetched, ["m1"]);
  });

  it("rethrows for a retry, then records failed on the final attempt", async () => {
    const first = setup({ readFails: true });
    await assert.rejects(first.pipeline.runJob(extractJob, notFinal), /read failed/);
    assert.deepEqual(first.calls.record, []);

    const last = setup({ readFails: true });
    assert.equal(await last.pipeline.runJob(extractJob, { isFinalAttempt: true }), "failed");
    assert.deepEqual(last.calls.record, [{ processedMessageId, outcome: "failed", items: [] }]);
  });
});

describe("syncConnection", () => {
  const syncJob: GmailSyncJob = {
    kind: "gmail.sync",
    connectionId,
    since: null,
    pageToken: null,
    startedAt: null,
  };

  it("queues one extraction per message and marks the window start as synced", async () => {
    const { pipeline, calls } = setup();
    assert.equal(await pipeline.runJob(syncJob, notFinal), "listed");
    assert.equal(calls.listed[0]?.query, "newer_than:30d");
    assert.deepEqual(calls.enqueued, [extractJob]);
    assert.deepEqual(calls.synced, [{ connectionId, syncedAt: now.toISOString() }]);
  });

  it("continues the listing in a follow-up job and waits to mark synced", async () => {
    const { pipeline, calls } = setup({
      page: { messages: [{ id: "m1", receivedAt }], nextPageToken: "p2" },
    });
    await pipeline.runJob({ ...syncJob, since: "2026-10-12T00:00:00.000Z" }, notFinal);
    assert.equal(calls.listed[0]?.query, `after:${Date.parse("2026-10-11T23:00:00.000Z") / 1000}`);
    assert.deepEqual(calls.enqueued[1], {
      ...syncJob,
      since: "2026-10-12T00:00:00.000Z",
      pageToken: "p2",
      startedAt: now.toISOString(),
    });
    assert.deepEqual(calls.synced, []);
  });

  it("schedules a sync per active connection from its last sync time", async () => {
    const { pipeline, calls } = setup();
    assert.equal(await pipeline.scheduleSyncs(), 1);
    assert.deepEqual(calls.enqueued, [{ ...syncJob, since: "2026-10-12T00:00:00.000Z" }]);
  });
});

describe("lost Gmail access", () => {
  it("reports the connection once Composio confirms the account is unusable", async () => {
    const { pipeline, calls } = setup({ readStatus: 403, accountUsable: false });
    assert.equal(await pipeline.runJob(extractJob, { isFinalAttempt: true }), "connection_lost");
    assert.deepEqual(calls.reported, [{ connectionId, reason: "authorization_lost" }]);
    // The message stays claimed but unfinished so it is read again after reconnecting.
    assert.deepEqual(calls.record, []);
  });

  it("stops a sync without marking it synced", async () => {
    const { pipeline, calls } = setup({ readStatus: 401, accountUsable: false });
    const syncJob: GmailSyncJob = {
      kind: "gmail.sync",
      connectionId,
      since: null,
      pageToken: null,
      startedAt: null,
    };
    assert.equal(await pipeline.runJob(syncJob, notFinal), "connection_lost");
    assert.deepEqual(calls.synced, []);
  });

  it("retries without reporting when the account is still usable or the check fails", async () => {
    for (const accountUsable of [true, "throws"] as const) {
      const { pipeline, calls } = setup({ readStatus: 401, accountUsable });
      await assert.rejects(pipeline.runJob(extractJob, notFinal));
      assert.deepEqual(calls.reported, []);
    }
  });

  it("never checks the account for rate limiting or server errors", async () => {
    for (const readStatus of [429, 500]) {
      const { pipeline, calls } = setup({ readStatus, accountUsable: false });
      await assert.rejects(pipeline.runJob(extractJob, notFinal));
      assert.deepEqual(calls.reported, []);
    }
  });
});

describe("backend errors", () => {
  it("treats only a JSON NOT_FOUND as an inactive connection", () => {
    assert.equal(
      new BackendOperationError("gmail.claim-message", 404, "NOT_FOUND").isNotFound,
      true,
    );
    // A missing route returns 404 without our error body; that must retry and surface, not drop.
    assert.equal(new BackendOperationError("gmail.claim-message", 404, null).isNotFound, false);
  });
});
