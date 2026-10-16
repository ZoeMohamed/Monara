import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  ClaimGmailMessageInput,
  ClaimGmailMessagesInput,
  GmailExtractionJob,
  GmailJob,
  GmailSyncJob,
  MarkGmailConnectionSyncedInput,
  MerchantCategorizeJob,
  RecordGmailDiscoveryInput,
  RecordGmailExtractionInput,
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
const processedMessageId = "00000000-0000-4000-8000-000000000020";
const receivedAt = "2026-10-12T03:15:00.000Z";
const now = new Date("2026-10-13T00:00:00.000Z");
// BCA_CC's registry sender, and Gmail's own header showing it authenticated.
const bcaCardSender = "kartukreditbca@klikbca.com";
const gmailPass = "mx.google.com; dkim=pass header.i=@klikbca.com";
const transactionId = "00000000-0000-4000-8000-000000000030";

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
    started: [] as string[],
    claimedPages: [] as ClaimGmailMessagesInput[],
    syncFailures: [] as ReportGmailSyncFailureInput[],
    merchantJobs: [] as MerchantCategorizeJob[],
    discoveries: [] as RecordGmailDiscoveryInput[],
    discoveryStarted: [] as string[],
    discoveryFailures: [] as string[],
    modelCalls: 0,
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
        institutionKeys: overrides.institutionKeys ?? ["BCA_CC"],
      };
    },
    async startDiscovery(id) {
      calls.discoveryStarted.push(id);
    },
    async recordDiscovery(input) {
      calls.discoveries.push(input);
    },
    async reportDiscoveryFailure(id) {
      calls.discoveryFailures.push(id);
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
      return {
        pendingGmailMessageIds: input.messages
          .map((message) => message.gmailMessageId)
          .filter((id) => !(overrides.finished ?? []).includes(id)),
      };
    },
    async reportSyncFailure(input) {
      calls.syncFailures.push(input);
    },
    async claimMessage(input) {
      calls.claim.push(input);
      return { processedMessageId, alreadyFinished: overrides.alreadyFinished ?? false };
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
      if (overrides.readFails) throw new Error("read failed");
      const fromAddress =
        overrides.fromAddress === undefined ? bcaCardSender : overrides.fromAddress;
      return {
        id,
        receivedAt,
        from: fromAddress,
        fromAddress,
        subject: "Struk",
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
    assert.deepEqual(calls.merchantJobs, [{ kind: "merchant.categorize", transactionId }]);
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
  };

  it("queues one extraction per message and marks the window start as synced", async () => {
    const { pipeline, calls } = setup();
    assert.equal(await pipeline.runJob(syncJob, notFinal), "listed");
    assert.equal(calls.listed[0]?.query, syncQuery(sendersFor(["BCA_CC"])));
    assert.deepEqual(calls.enqueued, [extractJob]);
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
      calls.enqueued.map((job) => (job.kind === "gmail.extract" ? job.gmailMessageId : job.kind)),
      ["m2"],
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
    // A new account must get its recent mail, so every sync uses the whole window.
    assert.equal(calls.listed[0]?.query, "newer_than:30d from:(KartuKreditBCA@klikbca.com)");
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

  it("schedules a sync per active connection from its last sync time", async () => {
    const { pipeline, calls } = setup();
    assert.equal(await pipeline.scheduleSyncs(), 1);
    assert.deepEqual(calls.enqueued, [{ ...syncJob, since: "2026-10-12T00:00:00.000Z" }]);
  });
});

describe("discover", () => {
  const discoverJob = { kind: "gmail.discover", connectionId } as const;

  it("tallies registry senders from metadata, with card endings from subjects", async () => {
    const { pipeline, calls } = setup({
      page: {
        messages: [
          summary("m1", { subject: "Transaksi kartu ****4242" }),
          summary("m2", { subject: "Tagihan xx9876", receivedAt: "2026-10-12T05:00:00.000Z" }),
          summary("m3", { senderAddress: "noreply@jago.com", subject: "Transfer masuk" }),
          summary("m4", { senderAddress: "promo@shop.example" }),
        ],
        nextPageToken: null,
      },
    });
    assert.equal(await pipeline.runJob(discoverJob, notFinal), "discovered");
    assert.deepEqual(calls.discoveryStarted, [connectionId]);
    assert.match(calls.listed[0]?.query ?? "", /^newer_than:90d from:\(/);
    assert.equal(calls.modelCalls, 0);
    assert.deepEqual(calls.fetched, [], "message bodies are never read");
    assert.deepEqual(calls.discoveries, [
      {
        connectionId,
        findings: [
          {
            institutionKey: "BCA_CC",
            emailCount: 2,
            lastFours: ["4242", "9876"],
            lastSeenAt: "2026-10-12T05:00:00.000Z",
          },
          {
            institutionKey: "Jago_App",
            emailCount: 1,
            lastFours: [],
            lastSeenAt: receivedAt,
          },
        ],
      },
    ]);
  });

  it("asks per institution when the listing leaves out senders", async () => {
    const { pipeline, calls } = setup({
      page: { messages: [summary("m1", { senderAddress: null })], nextPageToken: null },
    });
    await pipeline.runJob(discoverJob, notFinal);
    // One combined listing, then one per registry entry with senders.
    assert.ok(calls.listed.length > 2);
    assert.equal(calls.discoveries[0]?.findings.length, calls.listed.length - 1);
  });

  it("reports a discovery that failed its final attempt", async () => {
    const { pipeline, calls } = setup({ readStatus: 500 });
    await assert.rejects(pipeline.runJob(discoverJob, { isFinalAttempt: true }));
    assert.deepEqual(calls.discoveryFailures, [connectionId]);
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
