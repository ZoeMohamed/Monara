import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import {
  createComposioGmailTriggers,
  newMailTriggerQuery,
  parseComposioGmailEvent,
  verifyComposioWebhook,
} from "./gmail-trigger.ts";

const secret = "synthetic-webhook-secret";
const now = new Date("2026-10-17T10:00:00.000Z");
const timestamp = String(Math.floor(now.getTime() / 1000));

function sign(id, stamp, body, key = secret) {
  return createHmac("sha256", key).update(`${id}.${stamp}.${body}`).digest("base64");
}

describe("verifyComposioWebhook", () => {
  const body = JSON.stringify({ type: "composio.trigger.message" });
  const base = { secret, id: "msg_1", timestamp, body, now };

  it("accepts a correct signature, with or without the version prefix", async () => {
    const signature = sign("msg_1", timestamp, body);
    assert.equal(await verifyComposioWebhook({ ...base, signature: `v1,${signature}` }), true);
    assert.equal(await verifyComposioWebhook({ ...base, signature }), true);
    assert.equal(
      await verifyComposioWebhook({ ...base, signature: `v1,wrong v1,${signature}` }),
      true,
    );
  });

  it("rejects a changed body, another secret, or a stale timestamp", async () => {
    const signature = `v1,${sign("msg_1", timestamp, body)}`;
    assert.equal(await verifyComposioWebhook({ ...base, signature, body: `${body} ` }), false);
    assert.equal(
      await verifyComposioWebhook({
        ...base,
        signature: `v1,${sign("msg_1", timestamp, body, "other-secret")}`,
      }),
      false,
    );
    const old = String(Number(timestamp) - 301);
    assert.equal(
      await verifyComposioWebhook({
        ...base,
        timestamp: old,
        signature: `v1,${sign("msg_1", old, body)}`,
      }),
      false,
    );
  });

  it("fails closed without a secret or headers", async () => {
    const signature = `v1,${sign("msg_1", timestamp, body)}`;
    for (const missing of [
      { secret: undefined },
      { secret: " " },
      { id: null },
      { signature: null },
    ]) {
      assert.equal(await verifyComposioWebhook({ ...base, signature, ...missing }), false);
    }
  });
});

describe("parseComposioGmailEvent", () => {
  it("reads the current event shape", () => {
    assert.deepEqual(
      parseComposioGmailEvent({
        id: "msg_1",
        type: "composio.trigger.message",
        metadata: { trigger_slug: "GMAIL_NEW_GMAIL_MESSAGE", connected_account_id: "ca_1" },
        data: { message_id: "18f00000000000a1", subject: "ignored" },
      }),
      {
        triggerSlug: "GMAIL_NEW_GMAIL_MESSAGE",
        connectedAccountId: "ca_1",
        gmailMessageId: "18f00000000000a1",
      },
    );
  });

  it("reads the legacy V2 shape", () => {
    assert.deepEqual(
      parseComposioGmailEvent({
        type: "gmail_new_gmail_message",
        data: { id: "18f00000000000a2", connection_nano_id: "ca_2" },
      }),
      {
        triggerSlug: "GMAIL_NEW_GMAIL_MESSAGE",
        connectedAccountId: "ca_2",
        gmailMessageId: "18f00000000000a2",
      },
    );
  });

  it("returns null for anything without an account or message id", () => {
    for (const payload of [
      null,
      [],
      { data: {} },
      { metadata: { connected_account_id: "ca" }, data: {} },
    ]) {
      assert.equal(parseComposioGmailEvent(payload), null);
    }
  });
});

describe("createComposioGmailTriggers", () => {
  it("upserts one trigger per mailbox watching only the given senders", async () => {
    const calls = [];
    const triggers = createComposioGmailTriggers({
      apiUrl: "https://composio.example/api/v3.1",
      apiKey: "key",
      fetcher: async (url, init) => {
        calls.push({ url, init });
        return Response.json({ trigger_id: "ti_1" }, { status: 201 });
      },
    });
    const id = await triggers.upsert({
      connectedAccountId: "ca_1",
      senders: ["a@bank.example", "b@bank.example"],
    });
    assert.equal(id, "ti_1");
    assert.equal(
      calls[0].url,
      "https://composio.example/api/v3.1/trigger_instances/GMAIL_NEW_GMAIL_MESSAGE/upsert",
    );
    assert.equal(calls[0].init.headers["x-api-key"], "key");
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      connected_account_id: "ca_1",
      trigger_config: { query: "from:(a@bank.example OR b@bank.example)" },
    });
    assert.equal(newMailTriggerQuery(["x@y.example"]), "from:(x@y.example)");
  });

  it("treats an already deleted trigger as deleted and reports other failures", async () => {
    const respond = (status) =>
      createComposioGmailTriggers({
        apiUrl: "https://composio.example/api/v3.1",
        apiKey: "key",
        fetcher: async () => new Response(null, { status }),
      });
    await respond(404).remove("ti_1");
    await assert.rejects(respond(500).remove("ti_1"), {
      name: "ComposioTriggerError",
      status: 500,
    });
    await assert.rejects(
      respond(400).upsert({ connectedAccountId: "ca", senders: ["a@b.example"] }),
      {
        status: 400,
      },
    );
  });
});
