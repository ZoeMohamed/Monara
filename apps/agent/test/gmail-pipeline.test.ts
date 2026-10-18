import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  ClaimGmailMessageInput,
  ClaimGmailMessagesInput,
  GmailExtractionJob,
  GmailJob,
  GmailParseJob,
  GmailSyncJob,
  MarkGmailConnectionSyncedInput,
  MerchantCategorizeJob,
  RecordGmailExtractionInput,
  RecordGmailExtractionsInput,
  ReportGmailConnectionErrorInput,
  ReportGmailSyncFailureInput,
} from "@monara/contracts";
import {
  type ComposioGmailReader,
  type GmailMessagePage,
  type GmailMessageSummary,
  GmailReadError,
} from "@monara/integrations";
import { BackendOperationError, type GmailBackend } from "../src/gmail/backend.ts";
import type { LlmClient } from "../src/gmail/llm.ts";
import { createGmailPipeline, sendersFor, syncQuery } from "../src/gmail/pipeline.ts";

const connectionId = "00000000-0000-4000-8000-000000000010";
const otherConnectionId = "00000000-0000-4000-8000-000000000011";
const processedMessageId = "00000000-0000-4000-8000-000000000020";
const receivedAt = "2026-10-12T03:15:00.000Z";
const now = new Date("2026-10-13T00:00:00.000Z");
// BCA_CC's registry sender, and Gmail's own header showing it authenticated.
const bcaCardSender = "kartukreditbca@klikbca.com";
const gmailPass = "mx.google.com; dkim=pass header.i=@klikbca.com";
const transactionId = "00000000-0000-4000-8000-000000000030";

/** A stable claim id per listed message, as claim-messages would return it. */
function claimId(gmailMessageId: string): string {
  const digits = [...gmailMessageId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return `00000000-0000-4000-8000-${String(digits).padStart(12, "0")}`;
}

function summary(id: string, overrides: Partial<GmailMessageSummary> = {}): GmailMessageSummary {
  return {
    id,
    receivedAt,
    senderAddress: bcaCardSender,
    subject: "Transaksi ****4242",
    ...overrides,
  };
}

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
      accountHint: "BCA ****4242",
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
  /** Registry entries the User has as accounts. */
  institutionKeys?: string[];
  fromAddress?: string | null;
  authenticationResults?: string[];
  uncategorized?: string[];
  /** Listed messages an earlier sync already finished. */
  finished?: string[];
  /** Messages whose read fails, for partial batch failures. */
  failIds?: string[];
  /** Messages a claim reports as finished, for retried parse jobs. */
  finishedOnClaim?: string[];
  /** Uncategorized transactions recovered while claiming finished retry messages. */
  recoveredUncategorized?: string[];
  /** Simulates a record response whose transaction committed on an earlier attempt. */
  alreadyFinishedOnRecord?: boolean;
  holderName?: string | null;
  subject?: string;
}

/** Fake backend, reader and model that record every call the pipeline makes. */
function setup(overrides: Overrides = {}) {
  const calls = {
    claim: [] as ClaimGmailMessageInput[],
    record: [] as RecordGmailExtractionInput[],
    recordCalls: [] as RecordGmailExtractionsInput[],
    resolved: 0,
    synced: [] as MarkGmailConnectionSyncedInput[],
    enqueued: [] as GmailJob[],
    fetched: [] as string[],
    listed: [] as { query: string; pageToken?: string | null }[],
    reported: [] as ReportGmailConnectionErrorInput[],
    started: [] as string[],
    claimedPages: [] as ClaimGmailMessagesInput[],
    syncFailures: [] as ReportGmailSyncFailureInput[],
    merchantJobs: [] as MerchantCategorizeJob[],
    discovered: [] as string[],
    modelCalls: 0,
  };
  const backend: GmailBackend = {
    async listActiveConnections() {
      return {
        connections: [
          { connectionId, lastSyncedAt: "2026-10-12T00:00:00.000Z", hasAccounts: true },
          { connectionId: otherConnectionId, lastSyncedAt: null, hasAccounts: false },
        ],
      };
    },
    async resolveConnection(id) {
      calls.resolved += 1;
      if (overrides.inactive) {
        throw new BackendOperationError("gmail.resolve-connection", 404, "NOT_FOUND");
      }
      return {
        connectionId: id,
        userId: "00000000-0000-4000-8000-000000000001",
        composioConnectedAccountId: "ca_1",
        categoryNames: ["Food & Drink", "Transport"],
        holderName: overrides.holderName ?? null,
        institutionKeys: overrides.institutionKeys ?? ["BCA_CC"],
      };
    },
    async discover(id) {
      calls.discovered.push(id);
    },
    async resolveImportedTransaction() {
      throw new Error("not used by the Gmail pipeline");
    },
    async claimMerchantProfile() {
      throw new Error("not used by the Gmail pipeline");
    },
    async saveMerchantProfile() {},
    async releaseMerchantProfile() {},
    async setImportedCategory() {
      return false;
    },
    async startSync(id) {
      calls.started.push(id);
    },
    async claimMessages(input) {
      calls.claimedPages.push(input);
      const pending = input.messages
        .map((message) => message.gmailMessageId)
        .filter(
          (id) =>
            !(overrides.finished ?? []).includes(id) &&
            !(overrides.finishedOnClaim ?? []).includes(id),
        );
      return {
        pendingGmailMessageIds: pending,
        pending: pending.map((id) => ({ gmailMessageId: id, processedMessageId: claimId(id) })),
        uncategorizedTransactionIds: overrides.recoveredUncategorized ?? [],
      };
    },
    async reportSyncFailure(input) {
      calls.syncFailures.push(input);
    },
    async claimMessage(input) {
      calls.claim.push(input);
      return {
        processedMessageId,
        alreadyFinished:
          overrides.alreadyFinished ??
          (overrides.finishedOnClaim ?? []).includes(input.gmailMessageId),
      };
    },
    async recordExtractions(input) {
      calls.recordCalls.push(input);
      calls.record.push(...input.results);
      const uncategorized = overrides.uncategorized ?? [];
      return {
        results: input.results.map((result) => ({
          transactionIds: result.outcome === "transactions" ? uncategorized : [],
          alreadyFinished: overrides.alreadyFinishedOnRecord ?? false,
          uncategorizedTransactionIds: result.outcome === "transactions" ? uncategorized : [],
        })),
      };
    },
    async recordExtraction(input) {
      calls.record.push(input);
      const uncategorized = overrides.uncategorized ?? [];
      return {
        transactionIds: uncategorized,
        alreadyFinished: false,
        uncategorizedTransactionIds: uncategorized,
      };
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
      return overrides.page ?? { messages: [summary("m1")], nextPageToken: null };
    },
    async getMessage(_mailbox, id) {
      calls.fetched.push(id);
      if (overrides.readStatus) throw new GmailReadError("read failed", overrides.readStatus);
      if (overrides.readFails || (overrides.failIds ?? []).includes(id)) {
        throw new Error("read failed");
      }
      const fromAddress =
        overrides.fromAddress === undefined ? bcaCardSender : overrides.fromAddress;
      return {
        id,
        receivedAt,
        from: fromAddress,
        fromAddress,
        subject: overrides.subject ?? "Struk",
        text: "Total Rp 25.000 dibayar dengan BCA ****4242",
        html: null,
        authenticationResults: overrides.authenticationResults ?? [gmailPass],
      };
    },
  };
  const llm: LlmClient = {
    async completeJson() {
      calls.modelCalls += 1;
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
    enqueueMerchant: async (jobs) => {
      calls.merchantJobs.push(...jobs);
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
  it("claims, extracts and records the items with the sender's institution", async () => {
    const { pipeline, calls } = setup();
    assert.equal(await pipeline.runJob(extractJob, notFinal), "transactions");
    assert.deepEqual(calls.claim, [{ connectionId, gmailMessageId: "m1", receivedAt }]);
    assert.equal(calls.record[0]?.outcome, "transactions");
    assert.equal(calls.record[0]?.items[0]?.money?.amountMinor, "25000");
    assert.equal(calls.record[0]?.items[0]?.accountLastFour, "4242");
    assert.equal(calls.record[0]?.institutionKey, "BCA_CC");
    assert.equal(calls.record[0]?.senderVerified, true);
  });

  it("records an unauthenticated sender as unverified, so nothing is auto-confirmed", async () => {
    const { pipeline, calls } = setup({
      authenticationResults: ["mx.google.com; dkim=fail header.i=@klikbca.com; spf=fail"],
    });
    await pipeline.runJob(extractJob, notFinal);
    assert.equal(calls.record[0]?.institutionKey, "BCA_CC");
    assert.equal(calls.record[0]?.senderVerified, false);
  });

  it("skips mail from senders of institutions the User has not added, without the model", async () => {
    for (const overrides of [
      { fromAddress: "noreply@jago.com" },
      { fromAddress: "promo@shop.example" },
      { fromAddress: null },
    ]) {
      const { pipeline, calls } = setup(overrides);
      assert.equal(await pipeline.runJob(extractJob, notFinal), "skipped");
      assert.equal(calls.modelCalls, 0);
      assert.equal(calls.record[0]?.institutionKey, null);
    }
  });

  it("queues categorization for items the User's history could not categorize", async () => {
    const { pipeline, calls } = setup({ uncategorized: [transactionId] });
    await pipeline.runJob(extractJob, notFinal);
    assert.deepEqual(calls.merchantJobs, [
      { kind: "merchant.categorize", transactionIds: [transactionId] },
    ]);
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
    assert.deepEqual(calls.record, [
      {
        processedMessageId,
        outcome: "skipped",
        items: [],
        institutionKey: "BCA_CC",
        senderVerified: true,
      },
    ]);
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
    assert.deepEqual(last.calls.record, [
      {
        processedMessageId,
        outcome: "failed",
        items: [],
        institutionKey: null,
        senderVerified: false,
      },
    ]);
  });
});

describe("syncConnection", () => {
  const syncJob: GmailSyncJob = {
    kind: "gmail.sync",
    connectionId,
    since: null,
    pageToken: null,
    startedAt: null,
    institutionKeys: null,
    messageIds: null,
    tracksSync: true,
  };

  it("queues a parse job with the claim ids and marks the window start as synced", async () => {
    const { pipeline, calls } = setup();
    assert.equal(await pipeline.runJob(syncJob, notFinal), "listed");
    assert.equal(calls.listed[0]?.query, syncQuery(sendersFor(["BCA_CC"])));
    assert.deepEqual(calls.enqueued, [
      {
        kind: "gmail.parse",
        connectionId,
        emails: [{ processedMessageId: claimId("m1"), gmailMessageId: "m1", receivedAt }],
      },
    ]);
    assert.deepEqual(calls.synced, [{ connectionId, syncedAt: now.toISOString() }]);
  });

  it("starts the sync and claims the listed page before queueing extraction", async () => {
    const { pipeline, calls } = setup({
      page: {
        messages: [summary("m1"), summary("m2", { receivedAt: null })],
        nextPageToken: null,
      },
    });
    await pipeline.runJob(syncJob, notFinal);
    assert.deepEqual(calls.started, [connectionId]);
    // A listing without a timestamp is claimed at the sync's start time.
    assert.deepEqual(calls.claimedPages, [
      {
        connectionId,
        messages: [
          { gmailMessageId: "m1", receivedAt },
          { gmailMessageId: "m2", receivedAt: now.toISOString() },
        ],
      },
    ]);
  });

  it("starts the sync only on the first page", async () => {
    const { pipeline, calls } = setup();
    await pipeline.runJob({ ...syncJob, pageToken: "p2", startedAt: now.toISOString() }, notFinal);
    assert.deepEqual(calls.started, []);
  });

  it("lists only mail from the exact senders of the User's institutions", () => {
    const senders = sendersFor(["BCA_CC", "CIMB_Octo"]);
    assert.deepEqual(senders, [
      "KartuKreditBCA@klikbca.com",
      "octo-noreply@cimbniaga.co.id",
      "octomobile-noreply@cimbniaga.co.id",
    ]);
    assert.equal(
      syncQuery(senders),
      "newer_than:30d from:(KartuKreditBCA@klikbca.com OR octo-noreply@cimbniaga.co.id OR octomobile-noreply@cimbniaga.co.id)",
    );
  });

  it("queues only mail an earlier sync has not finished", async () => {
    const { pipeline, calls } = setup({
      page: { messages: [summary("m1"), summary("m2")], nextPageToken: null },
      finished: ["m1"],
    });
    await pipeline.runJob(syncJob, notFinal);
    assert.deepEqual(
      calls.enqueued.flatMap((job) =>
        job.kind === "gmail.parse" ? job.emails.map((email) => email.gmailMessageId) : [job.kind],
      ),
      ["m2"],
    );
  });

  it("splits a listed page into parse jobs of at most ten emails", async () => {
    const ids = Array.from({ length: 23 }, (_, index) => `m${index + 1}`);
    const { pipeline, calls } = setup({
      page: { messages: ids.map((id) => summary(id)), nextPageToken: null },
    });
    await pipeline.runJob(syncJob, notFinal);
    assert.deepEqual(
      calls.enqueued.map((job) => (job.kind === "gmail.parse" ? job.emails.length : 0)),
      [10, 10, 3],
    );
  });

  it("reads only the newly linked account's senders for a scoped run", async () => {
    const { pipeline, calls } = setup({ institutionKeys: ["BCA_CC", "CIMB_Octo"] });
    await pipeline.runJob({ ...syncJob, institutionKeys: ["CIMB_Octo"] }, notFinal);
    assert.equal(calls.listed[0]?.query, syncQuery(sendersFor(["CIMB_Octo"])));
  });

  it("never reads a scoped institution the mailbox has no account for", async () => {
    const { pipeline, calls } = setup({ institutionKeys: ["BCA_CC"] });
    await pipeline.runJob({ ...syncJob, institutionKeys: ["Jago_App"] }, notFinal);
    assert.deepEqual(calls.listed, []);
  });

  it("leaves the sync status alone for a run that joins another", async () => {
    const { pipeline, calls } = setup();
    await pipeline.runJob({ ...syncJob, tracksSync: false }, notFinal);
    assert.deepEqual(calls.started, []);
    assert.deepEqual(calls.synced, []);
    assert.equal(calls.enqueued[0]?.kind, "gmail.parse");
  });

  it("claims and parses a trigger's messages without listing or touching the sync status", async () => {
    const { pipeline, calls } = setup();
    await pipeline.runJob({ ...syncJob, messageIds: ["t1", "t2"] }, notFinal);
    assert.deepEqual(calls.listed, []);
    assert.deepEqual(calls.started, []);
    assert.deepEqual(calls.synced, []);
    assert.deepEqual(
      calls.enqueued.flatMap((job) =>
        job.kind === "gmail.parse" ? job.emails.map((email) => email.gmailMessageId) : [],
      ),
      ["t1", "t2"],
    );
  });

  it("reads nothing and completes when the User has no institution accounts", async () => {
    const { pipeline, calls } = setup({ institutionKeys: [] });
    assert.equal(await pipeline.runJob(syncJob, notFinal), "listed");
    assert.deepEqual(calls.listed, []);
    assert.deepEqual(calls.synced, [{ connectionId, syncedAt: now.toISOString() }]);
  });

  it("reports a sync that failed its final attempt, and retries quietly before that", async () => {
    const retried = setup({ readStatus: 500 });
    await assert.rejects(retried.pipeline.runJob(syncJob, notFinal));
    assert.deepEqual(retried.calls.syncFailures, []);

    const last = setup({ readStatus: 500 });
    await assert.rejects(last.pipeline.runJob(syncJob, { isFinalAttempt: true }));
    assert.deepEqual(last.calls.syncFailures, [{ connectionId, reason: "gmail_unavailable" }]);
  });

  it("continues the listing in a follow-up job and waits to mark synced", async () => {
    const { pipeline, calls } = setup({
      page: { messages: [summary("m1")], nextPageToken: "p2" },
    });
    await pipeline.runJob({ ...syncJob, since: "2026-10-12T00:00:00.000Z" }, notFinal);
    // A catch-up reads from a day before the last finished import.
    const after = Date.parse("2026-10-11T00:00:00.000Z") / 1000;
    assert.equal(calls.listed[0]?.query, `after:${after} from:(KartuKreditBCA@klikbca.com)`);
    assert.deepEqual(calls.enqueued[1], {
      ...syncJob,
      since: "2026-10-12T00:00:00.000Z",
      pageToken: "p2",
      startedAt: now.toISOString(),
    });
    assert.deepEqual(calls.synced, []);
  });

  it("processes a small manual fallback without queue writes or advancing the cursor", async () => {
    const { pipeline, calls } = setup();
    assert.equal(await pipeline.processRecent(syncJob, 5), "listed");
    assert.equal(calls.listed[0]?.query, syncQuery(sendersFor(["BCA_CC"])));
    assert.deepEqual(calls.enqueued, []);
    assert.deepEqual(calls.synced, []);
    assert.deepEqual(calls.fetched, ["m1"]);
    assert.equal(calls.record[0]?.outcome, "transactions");
  });

  it("never reads past the import window, whatever the last import time", () => {
    const senders = ["a@bank.example"];
    assert.equal(
      syncQuery(senders, "2026-08-01T00:00:00.000Z", now),
      "newer_than:30d from:(a@bank.example)",
    );
    assert.equal(syncQuery(senders, null, now), "newer_than:30d from:(a@bank.example)");
  });

  it("schedules discovery for every mailbox and a catch-up only where accounts read from it", async () => {
    const { pipeline, calls } = setup();
    assert.deepEqual(await pipeline.scheduleDaily(), { discoveries: 2, imports: 1 });
    assert.deepEqual(calls.enqueued, [
      { kind: "gmail.discover", connectionId },
      { kind: "gmail.discover", connectionId: otherConnectionId },
      { ...syncJob, since: "2026-10-12T00:00:00.000Z" },
    ]);
  });
});

describe("processBatch", () => {
  function parseJob(ids: string[]): GmailParseJob {
    return {
      kind: "gmail.parse",
      connectionId,
      emails: ids.map((id) => ({
        processedMessageId: claimId(id),
        gmailMessageId: id,
        receivedAt,
      })),
    };
  }

  it("resolves once, parses every email, and records them in one call", async () => {
    const { pipeline, calls } = setup({ uncategorized: [transactionId] });
    assert.equal(await pipeline.runJob(parseJob(["m1", "m2", "m3"]), notFinal), "transactions");
    assert.equal(calls.resolved, 1);
    assert.deepEqual(calls.claim, [], "the first delivery needs no claim call");
    assert.equal(calls.modelCalls, 3);
    assert.equal(calls.recordCalls.length, 1);
    assert.deepEqual(
      calls.record.map((result) => result.processedMessageId),
      [claimId("m1"), claimId("m2"), claimId("m3")],
    );
    // Categorization is queued in batches, not one job per transaction.
    assert.deepEqual(calls.merchantJobs, [
      {
        kind: "merchant.categorize",
        transactionIds: [transactionId, transactionId, transactionId],
      },
    ]);
  });

  it("records the emails that worked, then throws so the job retries", async () => {
    const { pipeline, calls } = setup({ failIds: ["m2"] });
    await assert.rejects(pipeline.runJob(parseJob(["m1", "m2", "m3"]), notFinal), /read failed/);
    assert.deepEqual(
      calls.record.map((result) => result.processedMessageId),
      [claimId("m1"), claimId("m3")],
    );
  });

  it("records a still-failing email as failed on the final attempt", async () => {
    const { pipeline, calls } = setup({ failIds: ["m2"] });
    const outcome = await pipeline.runJob(parseJob(["m1", "m2"]), {
      isFinalAttempt: true,
      isRetry: true,
    });
    assert.equal(outcome, "transactions");
    assert.deepEqual(
      calls.record.map((result) => [result.processedMessageId, result.outcome]),
      [
        [claimId("m1"), "transactions"],
        [claimId("m2"), "failed"],
      ],
    );
  });

  it("drops emails an earlier delivery finished before reading anything on a retry", async () => {
    const { pipeline, calls } = setup({ finishedOnClaim: ["m1"] });
    await pipeline.runJob(parseJob(["m1", "m2"]), { isFinalAttempt: false, isRetry: true });
    assert.deepEqual(calls.fetched, ["m2"]);
    assert.equal(calls.claimedPages.length, 1, "a retry reclaims the whole batch in one request");
    assert.deepEqual(calls.claim, []);
    assert.deepEqual(
      calls.record.map((result) => result.processedMessageId),
      [claimId("m2")],
    );

    const done = setup({ finishedOnClaim: ["m1"] });
    assert.equal(
      await done.pipeline.runJob(parseJob(["m1"]), { isFinalAttempt: false, isRetry: true }),
      "already_finished",
    );
    assert.deepEqual(done.calls.fetched, []);
  });

  it("requeues categorization for a transaction committed before a retry", async () => {
    const { pipeline, calls } = setup({
      finishedOnClaim: ["m1"],
      recoveredUncategorized: [transactionId],
    });
    assert.equal(
      await pipeline.runJob(parseJob(["m1"]), { isFinalAttempt: false, isRetry: true }),
      "already_finished",
    );
    assert.deepEqual(calls.fetched, []);
    assert.deepEqual(calls.merchantJobs, [
      { kind: "merchant.categorize", transactionIds: [transactionId] },
    ]);
  });

  it("requeues categorization when a retried record is already finished", async () => {
    const { pipeline, calls } = setup({
      uncategorized: [transactionId],
      alreadyFinishedOnRecord: true,
    });
    assert.equal(await pipeline.runJob(parseJob(["m1"]), notFinal), "transactions");
    assert.deepEqual(calls.merchantJobs, [
      { kind: "merchant.categorize", transactionIds: [transactionId] },
    ]);
  });

  it("skips mail from senders the User has no account for, without the model", async () => {
    const { pipeline, calls } = setup({ fromAddress: "promo@shop.example" });
    assert.equal(await pipeline.runJob(parseJob(["m1"]), notFinal), "skipped");
    assert.equal(calls.modelCalls, 0);
    assert.equal(calls.record[0]?.outcome, "skipped");
  });

  it("works on at most the configured number of emails at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const recordCalls: RecordGmailExtractionsInput[] = [];
    const pipeline = createGmailPipeline({
      backend: {
        async resolveConnection() {
          return {
            connectionId,
            userId: "00000000-0000-4000-8000-000000000001",
            composioConnectedAccountId: "ca_1",
            categoryNames: [],
            institutionKeys: ["BCA_CC"],
          };
        },
        async recordExtractions(input: RecordGmailExtractionsInput) {
          recordCalls.push(input);
          return {
            results: input.results.map(() => ({
              transactionIds: [],
              alreadyFinished: false,
              uncategorizedTransactionIds: [],
            })),
          };
        },
      } as unknown as GmailBackend,
      reader: {
        async isConnectionUsable() {
          return true;
        },
        async listMessages() {
          return { messages: [], nextPageToken: null };
        },
        async getMessage(_mailbox, id) {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 5));
          inFlight -= 1;
          return {
            id,
            receivedAt,
            from: "promo@shop.example",
            fromAddress: "promo@shop.example",
            subject: "Promo",
            text: "x",
            html: null,
            authenticationResults: [],
          };
        },
      },
      llm: {
        async completeJson() {
          return receipt;
        },
      },
      enqueue: async () => {},
      enqueueMerchant: async () => {},
      parseConcurrency: 2,
    });
    await pipeline.runJob(parseJob(["a", "b", "c", "d", "e"]), notFinal);
    assert.equal(peak, 2);
    assert.equal(recordCalls[0]?.results.length, 5);
  });

  it("records a one-time code email as skipped without the model", async () => {
    const { pipeline, calls } = setup({ subject: "Kode OTP transaksi Anda" });
    assert.equal(await pipeline.runJob(parseJob(["m1"]), notFinal), "skipped");
    assert.equal(calls.modelCalls, 0);
    assert.equal(calls.record[0]?.institutionKey, "BCA_CC");
  });

  it("turns a transfer to the holder's own name into an exclusion", async () => {
    const { pipeline, calls } = setup({
      holderName: "Adlyn Fakhreyz",
      llmOutput: {
        isTransactionEmail: true,
        items: [{ ...receipt.items[0], counterpartyName: "ADLYN FAKHREY" }],
      },
    });
    await pipeline.runJob(parseJob(["m1"]), notFinal);
    assert.equal(calls.record[0]?.items[0]?.kind, "exclusion");
    assert.equal(calls.record[0]?.items[0]?.flowDirection, "out");
  });

  it("stops without recording when the connection is lost", async () => {
    const { pipeline, calls } = setup({ readStatus: 403, accountUsable: false });
    assert.equal(
      await pipeline.runJob(parseJob(["m1", "m2"]), { isFinalAttempt: true }),
      "connection_lost",
    );
    assert.deepEqual(calls.record, []);
  });
});

describe("discover", () => {
  it("asks the web backend to run discovery and reads no mail itself", async () => {
    const { pipeline, calls } = setup();
    const job = { kind: "gmail.discover", connectionId } as const;
    assert.equal(await pipeline.runJob(job, notFinal), "discovered");
    assert.deepEqual(calls.discovered, [connectionId]);
    assert.deepEqual(calls.listed, []);
    assert.equal(calls.modelCalls, 0);
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
      institutionKeys: null,
      messageIds: null,
      tracksSync: true,
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
