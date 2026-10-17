import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chatRecoveryForFailure, initialChatSession, reduceChatSession } from "./session.ts";

const confirmation = {
  confirmationId: "00000000-0000-4000-8000-000000000001",
  action: "delete_transaction",
  resourceIds: ["00000000-0000-4000-8000-000000000002"],
  summary: "Delete a synthetic payment",
  expiresAt: "2030-01-01T00:00:00Z",
};
const at = "2026-10-17T12:00:00Z";

function pendingConversation() {
  let state = initialChatSession();
  state = reduceChatSession(state, {
    type: "message",
    id: "initial",
    message: { id: "user", role: "user", text: "Delete my coffee payment" },
    at,
  });
  state = reduceChatSession(state, {
    type: "message",
    id: "initial",
    message: {
      id: "agent",
      role: "agent",
      text: "Delete this payment?",
      result: { reply: "Delete this payment?", actions: [], confirmation },
    },
    at,
  });
  return reduceChatSession(state, {
    type: "history",
    id: "initial",
    history: [
      { role: "user", text: "Delete my coffee payment" },
      { role: "assistant", text: "Delete this payment?", confirmation },
    ],
  });
}

describe("page-session chat history", () => {
  it("archives the conversation and keeps its transport history separate from a new chat", () => {
    const previous = pendingConversation();
    const state = reduceChatSession(previous, { type: "new", id: "second" });
    assert.equal(state.activeId, "second");
    assert.deepEqual(state.conversations.find((item) => item.id === "second").history, []);
    const archived = state.conversations.find((item) => item.id === "initial");
    assert.equal(archived.messages.length, 2);
    assert.equal(archived.title, "Delete my coffee payment");
    assert.equal(archived.history.at(-1).confirmation, undefined);
    assert.equal(archived.messages.at(-1).result.confirmation, null);
    assert.equal(archived.messages.at(-1).closedConfirmation, true);
    assert.deepEqual(previous.conversations[0].history.at(-1).confirmation, confirmation);
  });

  it("restores text without renewing confirmation authority in UI or transport", () => {
    let state = reduceChatSession(pendingConversation(), { type: "new", id: "second" });
    state = reduceChatSession(state, {
      type: "message",
      id: "second",
      message: { id: "other", role: "user", text: "Summarize this week" },
      at,
    });
    state = reduceChatSession(state, { type: "restore", id: "initial" });
    assert.equal(state.activeId, "initial");
    const restored = state.conversations.find((item) => item.id === "initial");
    assert.equal(restored.history.length, 2);
    assert.equal(restored.history.at(-1).text, "Delete this payment?");
    assert.ok(restored.history.every((turn) => turn.confirmation === undefined));
    assert.equal(restored.messages.at(-1).result.confirmation, null);
    assert.equal(
      state.conversations.find((item) => item.id === "second").messages[0].text,
      "Summarize this week",
    );
  });

  it("closes confirmations on route exit or uncertain actions without deleting messages", () => {
    const state = reduceChatSession(pendingConversation(), {
      type: "close-confirmations",
      id: "initial",
    });
    assert.equal(state.conversations[0].messages.length, 2);
    assert.equal(state.conversations[0].history.at(-1).confirmation, undefined);
    assert.equal(state.conversations[0].messages.at(-1).closedConfirmation, true);
  });

  it("reuses an empty chat and ignores an unknown history entry", () => {
    const original = initialChatSession();
    assert.equal(
      reduceChatSession(original, { type: "new", id: "unused" }).conversations.length,
      1,
    );
    assert.equal(reduceChatSession(original, { type: "restore", id: "missing" }), original);
    assert.deepEqual(initialChatSession().conversations[0].messages, []);
  });

  it("keeps unsent text and a receipt when starting and restoring another chat", () => {
    const receipt = {
      attachment: {
        id: "00000000-0000-4000-8000-000000000003",
        name: "synthetic.png",
        mimeType: "image/png",
        sizeBytes: 8,
      },
      intent: "import_transaction",
      text: "",
      file: new File(["synthetic"], "synthetic.png", { type: "image/png" }),
      previewUrl: "data:image/png;base64,c3ludGhldGlj",
    };
    let state = reduceChatSession(initialChatSession(), {
      type: "draft",
      id: "initial",
      draft: "Lunch 40k, still checking the account",
    });
    state = reduceChatSession(state, { type: "receipt", id: "initial", receipt });
    state = reduceChatSession(state, { type: "new", id: "second" });
    assert.equal(state.activeId, "second");
    assert.equal(state.conversations.length, 2);
    assert.equal(state.conversations.find((item) => item.id === "second").draft, "");
    state = reduceChatSession(state, { type: "restore", id: "initial" });
    const restored = state.conversations.find((item) => item.id === state.activeId);
    assert.equal(restored.draft, "Lunch 40k, still checking the account");
    assert.equal(restored.receipt, receipt);
    assert.deepEqual(restored.messages, []);
    assert.equal(initialChatSession().conversations[0].receipt, null);
  });

  it("keeps an uncertain-result recovery gate when leaving and returning to a chat", () => {
    const interrupted = new Error("Synthetic network failure");
    interrupted.actionMayHaveCompleted = true;
    const recovery = chatRecoveryForFailure(interrupted);
    assert.equal(recovery.requiresRecordCheck, true);
    assert.equal(recovery.recordsOpened, false);
    assert.match(recovery.message, /may already be saved.*Check History/);
    let state = reduceChatSession(initialChatSession(), {
      type: "recovery",
      id: "initial",
      recovery,
    });
    state = reduceChatSession(state, { type: "new", id: "second" });
    state = reduceChatSession(state, { type: "restore", id: "initial" });
    assert.deepEqual(state.conversations.find((item) => item.id === "initial").recovery, recovery);
    assert.equal(
      chatRecoveryForFailure(new Error("Validation rejected")).requiresRecordCheck,
      false,
    );
    assert.equal(chatRecoveryForFailure(null).requiresRecordCheck, false);
  });

  it("does not cancel an active confirmation just by reopening the current history entry", () => {
    const state = pendingConversation();
    assert.equal(reduceChatSession(state, { type: "restore", id: "initial" }), state);
  });

  it("gives an expired sign-in a recoverable draft without presenting it as an uncertain write", () => {
    const failure = new Error("Synthetic signed-out response");
    failure.code = "UNAUTHENTICATED";
    const recovery = chatRecoveryForFailure(failure);
    assert.equal(recovery.signInRequired, true);
    assert.equal(recovery.requiresRecordCheck, false);
    assert.match(recovery.message, /message wasn’t sent.*Copy your draft/);
  });
});
