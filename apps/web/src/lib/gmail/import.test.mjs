import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, describe, it } from "node:test";

const userId = "00000000-0000-4000-8000-000000000001";
const first = "00000000-0000-4000-8000-000000000010";
const second = "00000000-0000-4000-8000-000000000011";
const state = {};
globalThis.monaraImportTest = state;

function reset() {
  Object.assign(state, {
    fullName: "Adlyn Fakhreyz",
    connections: [{ id: first, status: "active", lastSyncedAt: "2026-10-16T00:00:00Z" }],
    linked: { [first]: ["BCA_CC"], [second]: [] },
    running: [],
    agentFails: false,
    requests: [],
    joins: [],
    ingests: [],
    failures: [],
  });
}
reset();

const service = `
const test = globalThis.monaraImportTest;
export function gmailConnectionService() {
  return { async list() { return test.connections; } };
}
export function gmailIngestionRepository() {
  return {
    async requestSync(userId, connectionId) {
      test.requests.push(connectionId);
      if (test.running.includes(connectionId)) {
        const error = new Error("running");
        error.name = "GmailIngestionError";
        error.code = "CONFLICT";
        Object.setPrototypeOf(error, globalThis.monaraIngestionError.prototype);
        throw error;
      }
      test.running.push(connectionId);
      return "2026-10-17T08:00:00.000Z";
    },
    async failSync(input) { test.failures.push(input); },
    async joinSync(userId, connectionId) {
      test.joins.push(connectionId);
      return "2026-10-17T08:00:00.000Z";
    },
    async resolveConnection(connectionId) { return { institutionKeys: test.linked[connectionId] ?? [] }; },
  };
}
`;
const agentSync = `
export async function requestAgentIngest(input) {
  if (globalThis.monaraImportTest.agentFails) throw new Error("agent down");
  globalThis.monaraImportTest.ingests.push(input);
}
`;
const profile = `
export function profileService() {
  return { async fullName() { return globalThis.monaraImportTest.fullName; } };
}
`;
const core = `
export class GmailIngestionError extends Error {}
globalThis.monaraIngestionError = GmailIngestionError;
`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const mocks = {
      "@/lib/gmail/service": service,
      "@/lib/gmail/agent-sync": agentSync,
      "@/lib/profile/service": profile,
      "@monara/core": core,
    };
    if (specifier in mocks) {
      return {
        url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});
const { importAfterAccountLinked, importAfterNameSaved } = await import("./import.ts");
hooks.deregister();

/** An active account at an institution, fed by the first mailbox unless told otherwise. */
function account(institutionKey, overrides = {}) {
  return { institutionKey, gmailConnectionId: first, isActive: true, ...overrides };
}

describe("importing after an account is linked to a mailbox", () => {
  beforeEach(reset);

  it("imports only the new account's institution once the User has a name", async () => {
    await importAfterAccountLinked(userId, account("BCA_CC"), "account_added");
    assert.deepEqual(state.ingests, [
      {
        connectionId: first,
        reason: "account_added",
        institutionKeys: ["BCA_CC"],
        tracksSync: true,
      },
    ]);
  });

  it("waits for the name, so onboarding's own transfers are recognized", async () => {
    state.fullName = null;
    await importAfterAccountLinked(userId, account("BCA_CC"), "account_added");
    assert.deepEqual(state.requests, []);
    assert.deepEqual(state.ingests, []);
  });

  it("does nothing for an account Gmail cannot feed", async () => {
    for (const institutionKey of [null, "Cash", "Not_A_Key"]) {
      await importAfterAccountLinked(userId, account(institutionKey), "account_added");
    }
    assert.deepEqual(state.ingests, []);
  });

  it("joins a running import and keeps the status open for both jobs", async () => {
    await importAfterAccountLinked(userId, account("BCA_CC"), "account_added");
    await importAfterAccountLinked(userId, account("CIMB_Octo"), "account_added");
    assert.deepEqual(
      state.ingests.map((ingest) => [ingest.institutionKeys[0], ingest.tracksSync]),
      [
        ["BCA_CC", true],
        ["CIMB_Octo", true],
      ],
    );
    assert.deepEqual(state.joins, [first]);
  });

  it("marks the import failed when the agent cannot be reached", async () => {
    state.agentFails = true;
    await assert.rejects(importAfterAccountLinked(userId, account("BCA_CC"), "account_added"));
    assert.deepEqual(state.failures, [
      { connectionId: first, error: "agent_unavailable", requestedAt: "2026-10-17T08:00:00.000Z" },
    ]);
  });

  it("imports only from the account's own mailbox", async () => {
    state.connections.push({ id: second, status: "active", lastSyncedAt: null });
    await importAfterAccountLinked(
      userId,
      account("BCA_CC", { gmailConnectionId: second }),
      "account_moved",
    );
    assert.deepEqual(state.ingests, [
      {
        connectionId: second,
        reason: "account_moved",
        institutionKeys: ["BCA_CC"],
        tracksSync: true,
      },
    ]);
  });

  it("does nothing for a manual-only or inactive account", async () => {
    await importAfterAccountLinked(
      userId,
      account("BCA_CC", { gmailConnectionId: null }),
      "account_added",
    );
    await importAfterAccountLinked(userId, account("BCA_CC", { isActive: false }), "account_added");
    assert.deepEqual(state.requests, []);
  });

  it("skips disconnected or errored mailboxes", async () => {
    state.connections = [{ id: first, status: "error", lastSyncedAt: null }];
    await importAfterAccountLinked(userId, account("BCA_CC"), "account_added");
    assert.deepEqual(state.ingests, []);
  });
});

describe("importing after the name is saved", () => {
  beforeEach(reset);

  it("imports never-imported mailboxes that already have accounts", async () => {
    state.connections = [
      { id: first, status: "active", lastSyncedAt: null },
      { id: second, status: "active", lastSyncedAt: null },
    ];
    await importAfterNameSaved(userId);
    assert.deepEqual(state.ingests, [
      { connectionId: first, reason: "onboarding", institutionKeys: null, tracksSync: true },
    ]);
  });

  it("leaves mailboxes that were already imported alone", async () => {
    await importAfterNameSaved(userId);
    assert.deepEqual(state.requests, []);
  });
});
