import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createChatHistoryService } from "./chat-history.ts";
import { FinanceOperationError } from "./finance.ts";

const user = "70000000-0000-4000-8000-000000000007";
const chat = "71000000-0000-4000-8000-000000000001";
const receipt = {
  actionId: "72000000-0000-4000-8000-000000000001",
  resourceType: "transaction",
  resourceId: "73000000-0000-4000-8000-000000000001",
  changedAt: "2026-10-18T10:00:00Z",
  undoExpiresAt: "2026-10-18T10:05:00Z",
};
const confirmation = {
  confirmationId: "74000000-0000-4000-8000-000000000001",
  action: "delete_transaction",
  resourceIds: ["73000000-0000-4000-8000-000000000001"],
  summary: "Delete Kopi",
  expiresAt: "2026-10-18T10:05:00Z",
};

function memory() {
  const saved = [];
  return {
    saved,
    repository: {
      async appendExchange(input) {
        saved.push(input);
      },
      async listConversations(userId, limit) {
        return [
          {
            id: chat,
            title: "Kopi 25rb",
            updatedAt: "2026-10-18T10:00:00.123456+00:00",
            messageCount: 2,
            userId,
            limit,
          },
        ].map(({ userId: _u, limit: _l, ...row }) => row);
      },
      async listMessages(userId, conversationId, limit) {
        return [
          {
            id: chat,
            role: "user",
            text: "hi",
            result: null,
            closedConfirmation: false,
            userId,
            conversationId,
            limit,
          },
        ].map(({ userId: _u, conversationId: _c, limit: _l, ...row }) => row);
      },
    },
  };
}

describe("web chat history", () => {
  it("saves the answer as seen, with an open confirmation closed and images dropped", async () => {
    const { repository, saved } = memory();
    await createChatHistoryService(repository).saveExchange(
      user,
      { conversationId: chat, text: "  Delete my\n coffee  " },
      {
        reply: "Delete Kopi?",
        actions: [receipt],
        confirmation,
        visuals: [{ id: "x" }],
      },
    );
    assert.equal(saved.length, 1);
    const [entry] = saved;
    assert.equal(entry.userId, user);
    assert.equal(entry.title, "Delete my coffee");
    assert.equal(entry.userText, "Delete my\n coffee");
    assert.equal(entry.closedConfirmation, true);
    assert.deepEqual(entry.agentResult, {
      reply: "Delete Kopi?",
      actions: [receipt],
      confirmation: null,
    });
  });

  it("keeps a plain answer open and caps the title at 55 characters", async () => {
    const { repository, saved } = memory();
    await createChatHistoryService(repository).saveExchange(
      user,
      { conversationId: chat, text: "k".repeat(200) },
      { reply: "Done", actions: [], confirmation: null },
    );
    assert.equal(saved[0].closedConfirmation, false);
    assert.equal(saved[0].title.length, 55);
  });

  it("passes a caller timeout to persistence", async () => {
    const { repository, saved } = memory();
    const signal = AbortSignal.timeout(5_000);
    await createChatHistoryService(repository).saveExchange(
      user,
      { conversationId: chat, text: "hi" },
      { reply: "Done", actions: [], confirmation: null },
      signal,
    );
    assert.equal(saved[0].signal, signal);
  });

  it("refuses a conversation id or User id that is not a UUID before touching storage", async () => {
    const { repository, saved } = memory();
    const service = createChatHistoryService(repository);
    const response = { reply: "Done", actions: [], confirmation: null };
    await assert.rejects(() =>
      service.saveExchange(user, { conversationId: "initial", text: "hi" }, response),
    );
    await assert.rejects(() =>
      service.saveExchange("someone", { conversationId: chat, text: "hi" }, response),
    );
    assert.equal(saved.length, 0);
  });

  it("lists conversations and messages through the contracts", async () => {
    const service = createChatHistoryService(memory().repository);
    const list = await service.conversations(user);
    assert.equal(list.conversations[0].title, "Kopi 25rb");
    const messages = await service.messages(user, chat);
    assert.equal(messages.messages[0].role, "user");
    await assert.rejects(
      () => service.messages(user, "initial"),
      (error) => error instanceof FinanceOperationError && error.code === "VALIDATION_FAILED",
    );
  });
});
