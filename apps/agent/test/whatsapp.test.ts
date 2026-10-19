import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import type {
  AgentChatResponse,
  AgentChatTurn,
  ResolveWhatsAppSenderInput,
  ResolveWhatsAppSenderResult,
} from "@monara/contracts";
import { handleInbound } from "../src/whatsapp/index.ts";
import {
  ConversationSession,
  FAILURE_REPLY,
  IDLE_MS,
  type QueuedMessage,
  RECEIPT_FAILURE_REPLY,
  type SessionStorage,
} from "../src/whatsapp/session.ts";

const userId = "7b0c0f0e-4f0f-4a4e-9f43-2f8e6f1c9a11";
const secret = "test-webhook-secret";

// ---------------------------------------------------------------- webhook

const event = (id: string, from: string, message: Record<string, unknown>) => ({
  message: { id, from, kapso: { direction: "inbound" }, ...message },
  phone_number_id: "111",
});
const textEvent = (id: string, from: string, body: string) =>
  event(id, from, { type: "text", text: { body } });

async function deliver(
  payload: unknown,
  resolve: (input: ResolveWhatsAppSenderInput) => ResolveWhatsAppSenderResult,
  options: { signature?: string; failSend?: boolean } = {},
) {
  const rawBody = JSON.stringify(payload);
  const resolved: ResolveWhatsAppSenderInput[] = [];
  const sent: { to: string; text: string }[] = [];
  const queued: QueuedMessage[] = [];
  const response = await handleInbound(
    new Request("https://agent.test/webhooks/kapso", {
      method: "POST",
      body: rawBody,
      headers: {
        "X-Webhook-Event": "whatsapp.message.received",
        "X-Webhook-Signature":
          options.signature ?? createHmac("sha256", secret).update(rawBody).digest("hex"),
      },
    }),
    {
      webhookSecret: secret,
      resolveSender: async (input) => {
        resolved.push(input);
        return resolve(input);
      },
      sendText: async ({ to, text }) => {
        if (options.failSend) throw new Error("Kapso is down.");
        sent.push({ to, text });
      },
      enqueue: async (message) => {
        queued.push(message);
      },
    },
  );
  return { response, resolved, sent, queued };
}

test("an unlinked number gets the prompt to link, once, and nothing reaches the Agent", async () => {
  const batch = {
    batch: true,
    data: [
      textEvent("wamid.1", "6281200000001", "how much did I spend"),
      textEvent("wamid.2", "6281200000001", "hello?"),
    ],
  };
  const { response, resolved, sent, queued } = await deliver(batch, () => ({ status: "unlinked" }));

  assert.equal(response.status, 200);
  assert.deepEqual(queued, []);
  assert.equal(sent.length, 1);
  assert.match(sent[0]?.text ?? "", /isn't linked to a Monara account/);
  // Ordinary messages never travel to the backend, only the claimed number does.
  assert.deepEqual(resolved[0], { phoneE164: "+6281200000001", verificationCode: null });
});

test("a message that is only a six-digit code is offered to the backend as a code", async () => {
  const outcomes: Record<string, ResolveWhatsAppSenderResult> = {
    "482913": { status: "verified", userId },
    "111111": { status: "code_rejected", reason: "incorrect" },
    "222222": { status: "code_rejected", reason: "expired" },
    "333333": { status: "code_rejected", reason: "too_many_attempts" },
  };
  for (const [code, outcome] of Object.entries(outcomes)) {
    const { resolved, sent, queued } = await deliver(
      textEvent("wamid.1", "6281200000001", ` ${code} `),
      () => outcome,
    );
    assert.deepEqual(resolved, [{ phoneE164: "+6281200000001", verificationCode: code }]);
    assert.deepEqual(queued, []);
    assert.equal(sent.length, 1);
  }
  const partial = await deliver(textEvent("wamid.1", "6281200000001", "my code is 482913"), () => ({
    status: "unlinked",
  }));
  assert.equal(partial.resolved[0]?.verificationCode, null);
});

test("a linked User's text is queued for the Agent as that User", async () => {
  const { response, sent, queued } = await deliver(
    textEvent("wamid.9", "6281200000001", " lunch 20k "),
    () => ({ status: "linked", userId }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(sent, []);
  assert.deepEqual(queued, [
    { userId, messageId: "wamid.9", text: "lunch 20k", to: "6281200000001", phoneNumberId: "111" },
  ]);
});

test("a linked User's photo is queued as a receipt; a voice note or sticker gets a fixed reply", async () => {
  const media = { url: "https://api.kapso.ai/media/abc", content_type: "image/jpeg" };
  const photo = event("wamid.1", "6281200000001", {
    type: "image",
    kapso: { direction: "inbound", media_data: media },
  });
  const voice = event("wamid.2", "6281200000001", {
    type: "audio",
    kapso: {
      direction: "inbound",
      media_data: { url: "https://api.kapso.ai/media/def", content_type: "audio/ogg" },
    },
  });
  const sticker = event("wamid.3", "6281200000001", { type: "sticker" });
  const { sent, queued } = await deliver({ batch: true, data: [photo, voice, sticker] }, () => ({
    status: "linked",
    userId,
  }));

  assert.equal(queued.length, 1);
  assert.equal(queued[0]?.messageId, "wamid.1");
  assert.equal(queued[0]?.media?.url, media.url);
  assert.match(sent[0]?.text ?? "", /can't listen to voice notes/);
  assert.match(sent[1]?.text ?? "", /only read text messages/);
});

test("an unlinked sender's photo is never queued", async () => {
  const photo = event("wamid.1", "6281200000001", {
    type: "image",
    kapso: {
      direction: "inbound",
      media_data: { url: "https://api.kapso.ai/media/abc", content_type: "image/jpeg" },
    },
  });
  const { sent, queued } = await deliver(photo, () => ({ status: "unlinked" }));
  assert.deepEqual(queued, []);
  assert.match(sent[0]?.text ?? "", /isn't linked/);
});

test("a delivery with a bad signature is rejected before anything is looked up", async () => {
  const { response, resolved } = await deliver(
    textEvent("wamid.1", "6281200000001", "hi"),
    () => ({ status: "linked", userId }),
    { signature: "0".repeat(64) },
  );

  assert.equal(response.status, 401);
  assert.deepEqual(resolved, []);
});

test("a failed reply answers Kapso with an error so the delivery is retried", async () => {
  const { response } = await deliver(
    textEvent("wamid.1", "6281200000001", "hi"),
    () => ({ status: "unlinked" }),
    { failSend: true },
  );

  assert.equal(response.status, 502);
});

// ---------------------------------------------------------------- session

function harness(
  reply: (text: string, history: AgentChatTurn[]) => Promise<AgentChatResponse>,
  readReceipt?: (message: QueuedMessage) => Promise<string>,
) {
  const stored = new Map<string, unknown>();
  const sent: string[] = [];
  const asked: { text: string; history: AgentChatTurn[]; channel: string }[] = [];
  const clock = { now: 1_000_000, failSends: 0, alarm: null as number | null, active: true };
  const storage: SessionStorage = {
    get: async <T>(key: string) => structuredClone(stored.get(key)) as T | undefined,
    put: async (key, value) => {
      stored.set(key, structuredClone(value));
    },
    delete: async (key) => stored.delete(key),
    list: async <T>({ prefix }: { prefix: string }) =>
      new Map(
        [...stored]
          .filter(([key]) => key.startsWith(prefix))
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => [key, structuredClone(value) as T]),
      ),
    deleteAll: async () => stored.clear(),
    setAlarm: async (time) => {
      clock.alarm = time;
    },
  };
  const session = () =>
    new ConversationSession({
      storage,
      isActive: async () => clock.active,
      now: () => clock.now,
      ...(readReceipt ? { readReceipt } : {}),
      respond: async ({ caller, history, text }) => {
        asked.push({ text, history: [...history], channel: caller.channel });
        return reply(text, history);
      },
      send: async ({ text }) => {
        if (clock.failSends > 0) {
          clock.failSends -= 1;
          throw new Error("Kapso is down.");
        }
        sent.push(text);
      },
    });
  return { session, stored, sent, asked, clock };
}

const message = (messageId: string, text: string): QueuedMessage => ({
  userId,
  messageId,
  text,
  to: "6281200000001",
  phoneNumberId: "111",
});

const echo = async (text: string): Promise<AgentChatResponse> => ({
  reply: `You said ${text}`,
  actions: [],
  confirmation: null,
});

test("deletion discards a pending outbox instead of retrying its WhatsApp reply", async () => {
  const h = harness(echo);
  h.clock.failSends = 1;
  await h.session().receive(message("delete-outbox", "hello"));
  await assert.rejects(() => h.session().drain());
  h.clock.active = false;
  await h.session().drain();
  assert.deepEqual(h.sent, []);
  assert.equal(h.stored.size, 0);
});

test("a model reply finishing after deletion is neither stored nor sent", async () => {
  const h = harness(async (text) => {
    h.clock.active = false;
    return echo(text);
  });
  await h.session().receive(message("delete-inflight", "hello"));
  await h.session().drain();
  assert.deepEqual(h.sent, []);
  assert.equal(h.stored.size, 0);
});

test("a stale webhook for a deleted User cannot create conversation storage", async () => {
  const h = harness(echo);
  h.clock.active = false;
  await h.session().receive(message("delete-inbound", "hello"));
  assert.equal(h.stored.size, 0);
  assert.deepEqual(h.sent, []);
});

test("messages are answered in order, with earlier turns as history", async () => {
  const { session, sent, asked, clock } = harness(echo);
  await session().receive(message("wamid.1", "lunch 20k"));
  await session().receive(message("wamid.2", "gopay"));
  assert.equal(clock.alarm, clock.now);
  await session().drain();

  assert.deepEqual(sent, ["You said lunch 20k", "You said gopay"]);
  assert.deepEqual(asked[0], { text: "lunch 20k", history: [], channel: "whatsapp" });
  assert.deepEqual(asked[1]?.history, [
    { role: "user", text: "lunch 20k" },
    { role: "assistant", text: "You said lunch 20k" },
  ]);
  assert.equal(clock.alarm, clock.now + IDLE_MS);
});

test("a redelivered message is answered once", async () => {
  const { session, sent } = harness(echo);
  await session().receive(message("wamid.1", "lunch 20k"));
  await session().drain();
  await session().receive(message("wamid.1", "lunch 20k"));
  await session().drain();

  assert.deepEqual(sent, ["You said lunch 20k"]);
});

test("a failed send is retried without running the Agent again", async () => {
  const { session, sent, asked, clock } = harness(echo);
  await session().receive(message("wamid.1", "lunch 20k"));
  clock.failSends = 1;
  await assert.rejects(session().drain(), /Kapso is down/);
  await session().drain();

  assert.equal(asked.length, 1);
  assert.deepEqual(sent, ["You said lunch 20k"]);
});

test("when the Agent fails, the User is told and the turn is not kept or retried", async () => {
  const { session, sent, asked } = harness(async (text) => {
    if (text === "boom") throw new Error("model down");
    return echo(text);
  });
  await session().receive(message("wamid.1", "boom"));
  await session().receive(message("wamid.2", "hello"));
  await session().drain();

  assert.deepEqual(sent, [FAILURE_REPLY, "You said hello"]);
  assert.equal(asked.length, 2);
  assert.deepEqual(asked[1]?.history, []);
});

test("a message interrupted by a crash is never run a second time", async () => {
  const first = harness(() => new Promise<AgentChatResponse>(() => {}));
  await first.session().receive(message("wamid.1", "lunch 20k"));
  // The Agent never returns, as if the runtime died while it was working.
  void first.session().drain();
  await new Promise((resolve) => setTimeout(resolve, 10));

  const restarted = harness(echo);
  for (const [key, value] of first.stored) restarted.stored.set(key, value);
  await restarted.session().drain();

  assert.deepEqual(restarted.asked, []);
  assert.deepEqual(restarted.sent, [FAILURE_REPLY]);
});

test("receipts and a waiting confirmation are kept on the Agent's turn", async () => {
  const receipt = {
    actionId: "9a9b0c0d-1e1f-4a2b-8c3d-4e5f6a7b8c9d",
    resourceType: "transaction" as const,
    resourceId: "0d0f6f0a-1a1b-4c1d-8e1f-2a2b3c4d5e6f",
    changedAt: "2026-10-13T10:00:00Z",
    undoExpiresAt: "2026-10-13T10:10:00Z",
  };
  const { session, asked } = harness(async (text) => ({
    reply: `You said ${text}`,
    actions: text === "lunch 20k from gopay" ? [receipt] : [],
    confirmation: null,
  }));
  await session().receive(message("wamid.1", "lunch 20k from gopay"));
  await session().receive(message("wamid.2", "undo that"));
  await session().drain();

  assert.deepEqual(asked[1]?.history[1], {
    role: "assistant",
    text: "You said lunch 20k from gopay",
    actions: [receipt],
  });
});

test("a conversation is forgotten after half an hour of silence", async () => {
  const { session, stored, asked, clock } = harness(echo);
  await session().receive(message("wamid.1", "lunch 20k"));
  await session().drain();
  assert.ok(stored.size > 0);

  clock.now += IDLE_MS;
  await session().drain();
  assert.equal(stored.size, 0);

  await session().receive(message("wamid.2", "gopay"));
  await session().drain();
  assert.deepEqual(asked[1]?.history, []);
});

test("a message that arrives while the Agent is replying is not lost", async () => {
  let release: (response: AgentChatResponse) => void = () => {};
  const { session, sent, asked } = harness((text) =>
    text === "lunch 20k"
      ? new Promise<AgentChatResponse>((resolve) => {
          release = resolve;
        })
      : echo(text),
  );
  await session().receive(message("wamid.1", "lunch 20k"));
  const draining = session().drain();
  await new Promise((resolve) => setTimeout(resolve, 10));
  // The Agent is still thinking about the first message when the second one lands.
  await session().receive(message("wamid.2", "gopay"));
  release({ reply: "Which account?", actions: [], confirmation: null });
  await draining;

  assert.deepEqual(sent, ["Which account?", "You said gopay"]);
  assert.deepEqual(asked[1]?.history, [
    { role: "user", text: "lunch 20k" },
    { role: "assistant", text: "Which account?" },
  ]);
});

const photo = (messageId: string): QueuedMessage => ({
  ...message(messageId, ""),
  media: {
    url: "https://api.kapso.ai/media/abc",
    contentType: "image/jpeg",
    byteSize: 1000,
    caption: null,
  },
});

test("a receipt photo is read once and its reply joins the history for a follow-up", async () => {
  const read: string[] = [];
  const { session, sent, asked } = harness(echo, async (queued) => {
    read.push(queued.messageId);
    return "Got your receipt: Rp 37.000 at Indomaret.";
  });
  await session().receive(photo("wamid.1"));
  await session().receive(photo("wamid.1"));
  await session().receive(message("wamid.2", "confirm"));
  await session().drain();

  assert.deepEqual(read, ["wamid.1"]);
  assert.equal(sent[0], "Got your receipt: Rp 37.000 at Indomaret.");
  assert.equal(asked.length, 1, "the photo itself reached the Agent");
  assert.deepEqual(
    asked[0]?.history.map((turn) => turn.text),
    ["[Sent a receipt photo]", "Got your receipt: Rp 37.000 at Indomaret."],
  );
});

test("a receipt that fails to read says nothing can be confirmed", async () => {
  const { session, sent } = harness(echo, async () => {
    throw new Error("model down");
  });
  await session().receive(photo("wamid.1"));
  await session().drain();
  assert.equal(sent[0], RECEIPT_FAILURE_REPLY);
});
