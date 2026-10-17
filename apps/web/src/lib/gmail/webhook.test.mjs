import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { registerHooks } from "node:module";
import { beforeEach, describe, it } from "node:test";

const connectionId = "00000000-0000-4000-8000-000000000010";
const secret = "synthetic-webhook-secret";
const state = {};
globalThis.monaraWebhookTest = state;

function reset() {
  Object.assign(state, {
    accounts: { ca_1: connectionId },
    ingests: [],
    agentFails: false,
    // Trigger sync
    triggerIds: {},
    resolved: {
      [connectionId]: { composioConnectedAccountId: "ca_1", institutionKeys: ["BCA_CC"] },
    },
    composio: [],
  });
}
reset();

const service = `
const test = globalThis.monaraWebhookTest;
export const noStoreHeaders = { "Cache-Control": "no-store" };
export const errorResponse = (code) =>
  Response.json({ code }, { status: code === "UNAUTHENTICATED" ? 401 : code === "VALIDATION_FAILED" ? 400 : 503 });
export function gmailIngestionRepository() {
  return {
    async connectionForComposioAccount(id) { return test.accounts[id] ?? null; },
    async triggerIdOf(id) { return test.triggerIds[id] ?? null; },
    async setTriggerId(id, value) { test.triggerIds[id] = value; },
    async resolveConnection(id) {
      const found = test.resolved[id];
      if (!found) throw Object.assign(new globalThis.monaraIngestionError("inactive"), { code: "NOT_FOUND" });
      return found;
    },
  };
}
export function gmailConnectionService() {
  return { async list() { return Object.keys(test.resolved).map((id) => ({ id })); } };
}
`;
const agentSync = `
export async function requestAgentIngest(input) {
  if (globalThis.monaraWebhookTest.agentFails) throw new Error("agent down");
  globalThis.monaraWebhookTest.ingests.push(input);
}
`;
const core = `
export class GmailIngestionError extends Error {}
globalThis.monaraIngestionError = GmailIngestionError;
`;
const nextServer = "export function after(run) { run(); }";
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const mocks = {
      "@/lib/gmail/service": service,
      "@/lib/gmail/agent-sync": agentSync,
      "@monara/core": core,
      "next/server": nextServer,
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
const { POST } = await import("../../app/api/webhooks/composio/route.ts");
const { syncUserTriggers, removeMailboxTrigger } = await import("./trigger.ts");
hooks.deregister();

function signed(payload, { key = secret, stamp } = {}) {
  const body = JSON.stringify(payload);
  const timestamp = stamp ?? String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", key).update(`msg_1.${timestamp}.${body}`).digest("base64");
  return new Request("https://web.example/api/webhooks/composio", {
    method: "POST",
    headers: {
      "webhook-id": "msg_1",
      "webhook-timestamp": timestamp,
      "webhook-signature": `v1,${signature}`,
    },
    body,
  });
}

const newMail = {
  type: "composio.trigger.message",
  metadata: { trigger_slug: "GMAIL_NEW_GMAIL_MESSAGE", connected_account_id: "ca_1" },
  data: { message_id: "18f00000000000a1" },
};

function withEnv(values, run) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

describe("Composio webhook", () => {
  beforeEach(reset);

  it("queues the message for the mailbox behind a correctly signed event", () =>
    withEnv({ COMPOSIO_WEBHOOK_SECRET: secret }, async () => {
      const response = await POST(signed(newMail));
      assert.equal(response.status, 202);
      assert.deepEqual(state.ingests, [
        { connectionId, reason: "trigger", messageIds: ["18f00000000000a1"], tracksSync: false },
      ]);
    }));

  it("rejects a bad signature, a stale one, or a missing secret before reading the event", () =>
    withEnv({ COMPOSIO_WEBHOOK_SECRET: secret }, async () => {
      assert.equal((await POST(signed(newMail, { key: "other" }))).status, 401);
      assert.equal((await POST(signed(newMail, { stamp: "1700000000" }))).status, 401);
      delete process.env.COMPOSIO_WEBHOOK_SECRET;
      assert.equal((await POST(signed(newMail))).status, 401);
      assert.deepEqual(state.ingests, []);
    }));

  it("ignores other triggers and mailboxes that are no longer active", () =>
    withEnv({ COMPOSIO_WEBHOOK_SECRET: secret }, async () => {
      const other = {
        ...newMail,
        metadata: { ...newMail.metadata, trigger_slug: "GMAIL_EMAIL_SENT_TRIGGER" },
      };
      assert.equal((await POST(signed(other))).status, 204);
      const unknown = {
        ...newMail,
        metadata: { ...newMail.metadata, connected_account_id: "ca_gone" },
      };
      assert.equal((await POST(signed(unknown))).status, 204);
      assert.deepEqual(state.ingests, []);
    }));

  it("asks Composio to retry when the agent cannot take the event", () =>
    withEnv({ COMPOSIO_WEBHOOK_SECRET: secret }, async () => {
      state.agentFails = true;
      assert.equal((await POST(signed(newMail))).status, 503);
    }));
});

describe("mailbox triggers", () => {
  beforeEach(reset);
  const composio = (respond) => async (url, init) => {
    state.composio.push({
      url,
      method: init.method,
      body: init.body ? JSON.parse(init.body) : null,
    });
    return respond(url, init);
  };

  it("does nothing until triggers are enabled", () =>
    withEnv({ COMPOSIO_GMAIL_TRIGGERS_ENABLED: "" }, async () => {
      await syncUserTriggers("u1");
      await removeMailboxTrigger(connectionId);
      assert.deepEqual(state.triggerIds, {});
    }));

  it("watches the linked senders, then deletes the trigger when none are left", (t) =>
    withEnv(
      {
        COMPOSIO_GMAIL_TRIGGERS_ENABLED: "true",
        COMPOSIO_API_URL: "https://composio.example/api/v3.1",
        COMPOSIO_API_KEY: "key",
      },
      async () => {
        t.mock.method(
          globalThis,
          "fetch",
          composio((url) =>
            url.endsWith("/upsert")
              ? Response.json({ trigger_id: "ti_1" }, { status: 201 })
              : new Response(null, { status: 200 }),
          ),
        );
        await syncUserTriggers("u1");
        assert.equal(state.triggerIds[connectionId], "ti_1");
        assert.deepEqual(state.composio[0].body, {
          connected_account_id: "ca_1",
          trigger_config: { query: "from:(KartuKreditBCA@klikbca.com)" },
        });

        state.resolved[connectionId].institutionKeys = [];
        await syncUserTriggers("u1");
        assert.equal(state.composio[1].method, "DELETE");
        assert.equal(state.triggerIds[connectionId], null);
      },
    ));
});
