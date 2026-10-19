import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chatExchangeSchema, webChatBridgeResponseSchema } from "./chat-history.ts";
import { chatHistoryMaxBytes, chatStorageByteLength } from "./chat-limits.ts";
import {
  chatReceiptRequestSchema,
  chatVisualAttachmentSchema,
  webChatResponseSchema,
} from "./chat-media.ts";

const id = "00000000-0000-4000-8000-000000000001";
const visual = {
  id,
  kind: "spending_visualization",
  source: "supabase_storage",
  title: "This week’s spending",
  alt: "A chart of the synthetic weekly category totals",
  url: "https://synthetic.supabase.co/storage/v1/object/sign/chat-visuals/synthetic/chart.png?token=synthetic",
  expiresAt: "2030-01-01T00:00:00Z",
  width: 1080,
  height: 1350,
};

describe("chat media contracts", () => {
  it("keeps image-only receipt intent explicit and rejects caller identity fields", () => {
    const receipt = {
      attachment: { id, name: "receipt.png", mimeType: "image/png", sizeBytes: 1024 },
    };
    assert.deepEqual(chatReceiptRequestSchema.parse(receipt), {
      ...receipt,
      text: "",
      intent: "import_transaction",
    });
    assert.equal(chatReceiptRequestSchema.safeParse({ ...receipt, userId: id }).success, false);
    assert.equal(
      chatReceiptRequestSchema.safeParse({ ...receipt, intent: "confirm_transaction" }).success,
      false,
    );
  });

  it("accepts only signed private Supabase image URLs, never local files or public image links", () => {
    assert.equal(chatVisualAttachmentSchema.safeParse(visual).success, true);
    for (const url of [
      "javascript:alert(1)",
      "http://synthetic.supabase.co/storage/v1/object/sign/chat/x.png?token=x",
      "https://synthetic.supabase.co/storage/v1/object/public/chat/x.png",
      "https://synthetic.supabase.co/storage/v1/object/sign/chat/x.png",
      "https://user:password@synthetic.supabase.co/storage/v1/object/sign/chat/x.png?token=x",
      "file:///tmp/receipt.png",
    ])
      assert.equal(chatVisualAttachmentSchema.safeParse({ ...visual, url }).success, false);
  });

  it("extends text replies without changing existing response shapes", () => {
    const text = { reply: "Here’s your week.", actions: [], confirmation: null };
    assert.deepEqual(webChatResponseSchema.parse(text), text);
    assert.deepEqual(webChatResponseSchema.parse({ ...text, visuals: [visual] }).visuals, [visual]);
    assert.equal(
      webChatResponseSchema.safeParse({ ...text, visuals: [{ ...visual, height: -1 }] }).success,
      false,
    );
  });

  it("keeps live accepted replies within the private history character and action limits", () => {
    const action = {
      actionId: id,
      resourceType: "transaction",
      resourceId: id,
      changedAt: "2026-10-18T00:00:00Z",
      undoExpiresAt: "2026-10-18T01:00:00Z",
    };
    const reply = webChatResponseSchema.parse({
      reply: "x".repeat(12_000),
      actions: Array.from({ length: 20 }, () => action),
      confirmation: null,
    });
    const input = {
      conversationId: id,
      exchangeId: id,
      createdAt: "2026-10-18T12:00:00Z",
      text: "hi",
      response: reply,
    };
    assert.deepEqual(chatExchangeSchema.parse(input), input);
    assert.ok(chatStorageByteLength(input) <= chatHistoryMaxBytes);
    assert.equal(
      webChatResponseSchema.safeParse({ ...reply, reply: "x".repeat(12_001) }).success,
      false,
    );
    assert.equal(
      webChatResponseSchema.safeParse({ ...reply, actions: [...reply.actions, action] }).success,
      false,
    );
  });

  it("does not count a pending recovery receipt against the verified reply size limit", () => {
    const response = {
      reply: "A concise verified answer.",
      actions: [],
      confirmation: null,
      historySave: {
        status: "pending",
        exchangeId: id,
        recoveryToken: "x".repeat(190_000),
        expiresAt: "2026-10-19T12:00:00Z",
      },
    };
    assert.equal(webChatBridgeResponseSchema.safeParse(response).success, true);
  });

  it("rejects replies whose encoded history exceeds the byte limit without truncating content", () => {
    const escaped = { reply: "\u0001".repeat(12_000), actions: [], confirmation: null };
    assert.equal(webChatResponseSchema.safeParse(escaped).success, false);
    const unicodeAndImages = {
      reply: "界".repeat(12_000),
      actions: [],
      confirmation: null,
      visuals: Array.from({ length: 4 }, () => ({
        ...visual,
        url: `${visual.url}${"x".repeat(15_000)}`,
      })),
    };
    assert.equal(webChatResponseSchema.safeParse(unicodeAndImages).success, false);
    const valid = { ...unicodeAndImages, visuals: [visual] };
    const accepted = webChatResponseSchema.parse(valid);
    assert.equal(accepted.reply, valid.reply);
    assert.deepEqual(accepted.visuals, valid.visuals);
    assert.doesNotThrow(() =>
      chatExchangeSchema.parse({
        conversationId: id,
        exchangeId: id,
        createdAt: "2026-10-18T12:00:00Z",
        text: "hi",
        response: accepted,
      }),
    );
  });
});
