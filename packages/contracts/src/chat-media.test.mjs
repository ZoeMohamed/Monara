import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
});
