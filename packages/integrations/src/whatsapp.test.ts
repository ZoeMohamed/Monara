import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, test } from "node:test";
import {
  createKapsoTransport,
  parseKapsoInboundMessages,
  verifyKapsoSignature,
} from "./whatsapp.ts";

const secret = "test-webhook-secret";
const sign = (body: string) => createHmac("sha256", secret).update(body).digest("hex");

const inboundEvent = (overrides: Record<string, unknown> = {}) => ({
  message: {
    id: "wamid.1",
    type: "text",
    from: "+62 812-0000-0001",
    text: { body: "coffee 28k" },
    kapso: { direction: "inbound" },
  },
  conversation: { phone_number: "6281200000001", phone_number_id: "111" },
  phone_number_id: "111",
  ...overrides,
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("accepts a signature made with the webhook secret", async () => {
  const rawBody = JSON.stringify(inboundEvent());
  assert.equal(await verifyKapsoSignature({ rawBody, signature: sign(rawBody), secret }), true);
  assert.equal(
    await verifyKapsoSignature({ rawBody, signature: sign(rawBody).toUpperCase(), secret }),
    true,
  );
});

test("rejects a wrong, missing, or malformed signature and an empty secret", async () => {
  const rawBody = JSON.stringify(inboundEvent());
  const signature = sign(rawBody);
  assert.equal(await verifyKapsoSignature({ rawBody: `${rawBody} `, signature, secret }), false);
  assert.equal(await verifyKapsoSignature({ rawBody, signature: sign("other"), secret }), false);
  assert.equal(await verifyKapsoSignature({ rawBody, signature: null, secret }), false);
  assert.equal(await verifyKapsoSignature({ rawBody, signature: "not-hex", secret }), false);
  assert.equal(await verifyKapsoSignature({ rawBody, signature, secret: "" }), false);
});

test("reads a single inbound text message and normalises the sender", () => {
  assert.deepEqual(parseKapsoInboundMessages(inboundEvent()), [
    {
      messageId: "wamid.1",
      from: "6281200000001",
      phoneNumberId: "111",
      type: "text",
      text: "coffee 28k",
    },
  ]);
});

test("reads every message in a buffered batch", () => {
  const second = inboundEvent({
    message: { id: "wamid.2", type: "image", from: "6281200000001" },
  });
  const messages = parseKapsoInboundMessages({ batch: true, data: [inboundEvent(), second] });
  assert.deepEqual(
    messages.map(({ messageId, type, text }) => ({ messageId, type, text })),
    [
      { messageId: "wamid.1", type: "text", text: "coffee 28k" },
      { messageId: "wamid.2", type: "image", text: null },
    ],
  );
});

test("skips outbound, senderless, and malformed events", () => {
  const outbound = inboundEvent({
    message: { id: "wamid.3", type: "text", from: "111", kapso: { direction: "outbound" } },
  });
  const senderless = { message: { id: "wamid.4", type: "text" }, phone_number_id: "111" };
  assert.deepEqual(
    parseKapsoInboundMessages({ batch: true, data: [outbound, senderless, { nope: 1 }, null] }),
    [],
  );
  assert.deepEqual(parseKapsoInboundMessages("not an event"), []);
});

test("sends text through the Kapso messages endpoint", async () => {
  const requests: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    return Response.json({ messages: [{ id: "wamid.out" }] });
  }) as typeof fetch;

  const transport = createKapsoTransport({ apiKey: "key-123", phoneNumberId: "111" });
  const result = await transport.sendText({ to: "6281200000001", text: "Hello" });

  assert.deepEqual(result, { messageId: "wamid.out" });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "https://api.kapso.ai/meta/whatsapp/v24.0/111/messages");
  assert.equal(new Headers(requests[0]?.init.headers).get("X-API-Key"), "key-123");
  assert.deepEqual(JSON.parse(String(requests[0]?.init.body)), {
    messaging_product: "whatsapp",
    to: "6281200000001",
    type: "text",
    text: { body: "Hello" },
  });
});

test("splits text that is longer than one WhatsApp message", async () => {
  const bodies: string[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)).text.body);
    return Response.json({ messages: [{ id: `wamid.${bodies.length}` }] });
  }) as typeof fetch;

  const transport = createKapsoTransport({ apiKey: "key-123", phoneNumberId: "111" });
  const result = await transport.sendText({ to: "6281200000001", text: "a".repeat(9000) });

  assert.equal(bodies.length, 3);
  assert.ok(bodies.every((body) => body.length <= 4096));
  assert.equal(bodies.join("").length, 9000);
  assert.deepEqual(result, { messageId: "wamid.3" });
});

test("fails without leaking the provider response when Kapso rejects a message", async () => {
  globalThis.fetch = (async () =>
    new Response("recipient 6281200000001 is outside the window", {
      status: 422,
    })) as typeof fetch;
  const transport = createKapsoTransport({ apiKey: "key-123", phoneNumberId: "111" });
  await assert.rejects(transport.sendText({ to: "6281200000001", text: "Hello" }), (error) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /status 422/);
    assert.doesNotMatch(error.message, /6281200000001/);
    return true;
  });
});
