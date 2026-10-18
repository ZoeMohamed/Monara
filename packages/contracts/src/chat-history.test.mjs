import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { savedChatMessageSchema, webChatRequestSchema } from "./chat-history.ts";

const conversationId = "30000000-0000-4000-8000-000000000001";

describe("web chat history contracts", () => {
  it("accepts a conversation id with the message but never a user id", () => {
    assert.equal(
      webChatRequestSchema.safeParse({ text: "hi", history: [], conversationId }).success,
      true,
    );
    assert.equal(webChatRequestSchema.safeParse({ text: "hi", history: [] }).success, false);
    assert.equal(
      webChatRequestSchema.safeParse({ text: "hi", conversationId: "initial" }).success,
      false,
    );
    assert.equal(
      webChatRequestSchema.safeParse({
        text: "hi",
        conversationId,
        userId: "30000000-0000-4000-8000-000000000002",
      }).success,
      false,
    );
  });

  it("restores an Agent reply only as receipts, never as an open confirmation", () => {
    const base = {
      id: "30000000-0000-4000-8000-000000000003",
      role: "agent",
      text: "Done",
      closedConfirmation: false,
    };
    assert.equal(
      savedChatMessageSchema.safeParse({
        ...base,
        result: { reply: "Done", actions: [], confirmation: null },
      }).success,
      true,
    );
    assert.equal(
      savedChatMessageSchema.safeParse({ ...base, result: { reply: "Done" } }).success,
      false,
    );
    assert.equal(
      savedChatMessageSchema.safeParse({ ...base, role: "error", result: null }).success,
      false,
    );
  });
});
