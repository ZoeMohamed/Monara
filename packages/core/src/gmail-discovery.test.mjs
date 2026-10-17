import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DISCOVERY_STALL_MS,
  discoveryNeedsRun,
  isNewFinding,
  runGmailDiscovery,
} from "./gmail-discovery.ts";
import { GmailIngestionError, runGmailIngestionOperation } from "./gmail-ingestion.ts";

const connectionId = "00000000-0000-4000-8000-000000000010";
const receivedAt = "2026-10-12T03:15:00.000Z";
const bcaCardSender = "kartukreditbca@klikbca.com";

function summary(id, overrides = {}) {
  return {
    id,
    receivedAt,
    senderAddress: bcaCardSender,
    subject: "Transaksi ****4242",
    ...overrides,
  };
}

class ReadError extends Error {
  constructor(status) {
    super("read failed");
    this.status = status;
  }
}

function setup({ page, readStatus, usable = true, inactive = false } = {}) {
  const calls = { listed: [], started: [], recorded: [], failed: [], errored: [] };
  const repository = {
    async resolveConnection(id) {
      if (inactive) throw new GmailIngestionError("NOT_FOUND", "inactive");
      return {
        connectionId: id,
        userId: "00000000-0000-4000-8000-000000000001",
        composioConnectedAccountId: "ca_1",
        categoryNames: [],
        institutionKeys: [],
      };
    },
    async startDiscovery(id) {
      calls.started.push(id);
    },
    async recordDiscovery(input) {
      calls.recorded.push(input);
    },
    async failDiscovery(id) {
      calls.failed.push(id);
    },
    async markError(id) {
      calls.errored.push(id);
    },
  };
  const reader = {
    async listMessages(_mailbox, input) {
      calls.listed.push(input);
      if (readStatus) throw new ReadError(readStatus);
      return page ?? { messages: [summary("m1")], nextPageToken: null };
    },
    async isConnectionUsable() {
      return usable;
    },
  };
  return { deps: { repository, reader }, calls };
}

describe("runGmailDiscovery", () => {
  it("tallies registry senders from metadata, with card endings from subjects", async () => {
    const { deps, calls } = setup({
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
    await runGmailDiscovery(deps, connectionId);
    assert.deepEqual(calls.started, [connectionId]);
    assert.match(calls.listed[0]?.query ?? "", /^newer_than:30d from:\(/);
    assert.deepEqual(calls.recorded, [
      {
        connectionId,
        findings: [
          {
            institutionKey: "BCA_CC",
            emailCount: 2,
            lastFours: ["4242", "9876"],
            lastSeenAt: "2026-10-12T05:00:00.000Z",
          },
          { institutionKey: "Jago_App", emailCount: 1, lastFours: [], lastSeenAt: receivedAt },
        ],
      },
    ]);
  });

  it("follows pages up to the message cap", async () => {
    const { deps, calls } = setup({
      page: {
        messages: Array.from({ length: 100 }, (_, i) => summary(`m${i}`)),
        nextPageToken: "more",
      },
    });
    await runGmailDiscovery(deps, connectionId);
    assert.equal(calls.listed.length, 5);
  });

  it("asks per institution when the listing leaves out senders", async () => {
    const { deps, calls } = setup({
      page: { messages: [summary("m1", { senderAddress: null })], nextPageToken: null },
    });
    await runGmailDiscovery(deps, connectionId);
    assert.ok(calls.listed.length > 2);
    assert.equal(calls.recorded[0]?.findings.length, calls.listed.length - 1);
  });

  it("marks the discovery failed when a read fails", async () => {
    const { deps, calls } = setup({ readStatus: 500 });
    await assert.rejects(runGmailDiscovery(deps, connectionId), { status: 500 });
    assert.deepEqual(calls.failed, [connectionId]);
    assert.deepEqual(calls.errored, []);
  });

  it("marks the connection errored only when Composio confirms lost access", async () => {
    const lost = setup({ readStatus: 403, usable: false });
    await assert.rejects(runGmailDiscovery(lost.deps, connectionId), { code: "NOT_FOUND" });
    assert.deepEqual(lost.calls.errored, [connectionId]);
    assert.deepEqual(lost.calls.failed, []);

    const usable = setup({ readStatus: 403, usable: true });
    await assert.rejects(runGmailDiscovery(usable.deps, connectionId), { status: 403 });
    assert.deepEqual(usable.calls.errored, []);
    assert.deepEqual(usable.calls.failed, [connectionId]);
  });

  it("does nothing for an inactive connection", async () => {
    const { deps, calls } = setup({ inactive: true });
    await assert.rejects(runGmailDiscovery(deps, connectionId), { code: "NOT_FOUND" });
    assert.deepEqual(calls.started, []);
    assert.deepEqual(calls.listed, []);
  });
});

describe("discoveryNeedsRun", () => {
  const now = new Date("2026-10-17T10:00:00.000Z");
  it("reruns idle, failed and stalled discoveries only", () => {
    assert.equal(discoveryNeedsRun({ state: "idle", updatedAt: null }, now), true);
    assert.equal(discoveryNeedsRun({ state: "failed", updatedAt: now.toISOString() }, now), true);
    assert.equal(discoveryNeedsRun({ state: "completed", updatedAt: null }, now), false);
    const fresh = new Date(now.getTime() - 10_000).toISOString();
    const stale = new Date(now.getTime() - DISCOVERY_STALL_MS - 1).toISOString();
    assert.equal(discoveryNeedsRun({ state: "running", updatedAt: fresh }, now), false);
    assert.equal(discoveryNeedsRun({ state: "running", updatedAt: stale }, now), true);
  });
});

describe("discover operation", () => {
  it("runs the backend's discovery for a valid connection only", async () => {
    const ran = [];
    const result = await runGmailIngestionOperation(
      {},
      "discover",
      { connectionId },
      {
        discover: async (id) => void ran.push(id),
      },
    );
    assert.deepEqual(result, {});
    assert.deepEqual(ran, [connectionId]);
    await assert.rejects(
      runGmailIngestionOperation(
        {},
        "discover",
        { connectionId: "nope" },
        { discover: async () => {} },
      ),
      { code: "VALIDATION_FAILED" },
    );
  });

  it("fails closed when discovery is not wired", async () => {
    await assert.rejects(runGmailIngestionOperation({}, "discover", { connectionId }), {
      code: "INTERNAL",
    });
  });
});

describe("isNewFinding", () => {
  const firstScan = "2026-10-10T00:00:00.000Z";
  const finding = {
    institutionKey: "BCA_CC",
    firstSeenAt: "2026-10-12T01:00:00.000Z",
    dismissedAt: null,
  };

  it("is new only when a later scan found it and it has no account or dismissal", () => {
    assert.equal(isNewFinding(finding, firstScan, new Set()), true);
    assert.equal(isNewFinding({ ...finding, firstSeenAt: firstScan }, firstScan, new Set()), false);
    assert.equal(isNewFinding(finding, firstScan, new Set(["BCA_CC"])), false);
    assert.equal(isNewFinding({ ...finding, dismissedAt: firstScan }, firstScan, new Set()), false);
    assert.equal(isNewFinding(finding, null, new Set()), false);
  });
});
