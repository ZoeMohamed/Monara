import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { retryChatHistorySave } from "./client.ts";
import { issueChatHistoryRecovery, verifyChatHistoryRecovery } from "./history-recovery.ts";
import { ChatHistorySaveQueue } from "./history-save-queue.ts";
import { persistChatExchange } from "./persist-exchange.ts";

const owner = "81000000-0000-4000-8000-000000000001";
const other = "81000000-0000-4000-8000-000000000002";
const chat = "82000000-0000-4000-8000-000000000001";
const exchange = {
  exchangeId: "83000000-0000-4000-8000-000000000001",
  createdAt: "2026-10-18T12:00:00Z",
  conversationId: chat,
  text: "Coffee 25k",
  response: { reply: "Saved coffee, Rp25,000.", actions: [], confirmation: null },
};
const secret = "synthetic-local-test-secret-not-a-provider-key";
const now = Date.parse("2026-10-18T12:00:00Z");

function pending(id = exchange.exchangeId) {
  return issueChatHistoryRecovery(owner, { ...exchange, exchangeId: id }, secret, now);
}

describe("private chat history recovery", () => {
  it("binds the verified reply to its owner, exact contents and expiry", () => {
    const receipt = pending();
    assert.deepEqual(
      verifyChatHistoryRecovery(receipt.recoveryToken, owner, secret, now),
      exchange,
    );
    assert.throws(
      () => verifyChatHistoryRecovery(receipt.recoveryToken, other, secret, now),
      /verified/,
    );
    assert.throws(
      () => verifyChatHistoryRecovery(receipt.recoveryToken, owner, "wrong-secret", now),
      /verified/,
    );
    const [payload, signature] = receipt.recoveryToken.split(".");
    const tampered = JSON.parse(Buffer.from(payload, "base64url").toString());
    tampered.exchange.response.reply = "Forged financial change";
    const forged = `${Buffer.from(JSON.stringify(tampered)).toString("base64url")}.${signature}`;
    assert.throws(() => verifyChatHistoryRecovery(forged, owner, secret, now), /verified/);
    assert.throws(
      () =>
        verifyChatHistoryRecovery(
          receipt.recoveryToken,
          owner,
          secret,
          Date.parse(receipt.expiresAt),
        ),
      /expired.*Copy this chat/,
    );
  });

  it("returns the Agent answer with save-only recovery after a storage outage", async () => {
    let storageCalls = 0;
    const result = await persistChatExchange(
      owner,
      exchange,
      exchange.response,
      secret,
      async () => {
        storageCalls += 1;
        throw new Error("Synthetic outage");
      },
    );
    assert.equal(storageCalls, 1);
    assert.equal(result.reply, exchange.response.reply);
    assert.equal(result.historySave.status, "pending");
    const original = verifyChatHistoryRecovery(result.historySave.recoveryToken, owner, secret);
    const retried = [];
    const queue = new ChatHistorySaveQueue();
    queue.remember(result.historySave);
    await queue.flush(async (save) => {
      retried.push(verifyChatHistoryRecovery(save.recoveryToken, owner, secret));
      return { status: "saved", exchangeId: save.exchangeId };
    });
    assert.deepEqual(retried, [original]);
    assert.equal(queue.count, 0);
    assert.equal(storageCalls, 1, "history retry never repeats the Agent request");
  });

  it("keeps interrupted saves and later replies until each exact exchange is acknowledged", async () => {
    const queue = new ChatHistorySaveQueue();
    const first = pending();
    const second = pending("83000000-0000-4000-8000-000000000002");
    queue.remember(first);
    await assert.rejects(
      queue.flush(async () => {
        throw new TypeError("Synthetic lost save reply");
      }),
    );
    queue.remember(second);
    assert.equal(queue.count, 2);
    const saved = [];
    await queue.flush(async (next) => {
      saved.push(next.exchangeId);
      return { status: "saved", exchangeId: next.exchangeId };
    });
    assert.deepEqual(saved, [first.exchangeId, second.exchangeId]);
    assert.equal(queue.count, 0);
  });

  it("drains newly arriving replies and refuses a mismatched save acknowledgment", async () => {
    const queue = new ChatHistorySaveQueue();
    const first = pending();
    const second = pending("83000000-0000-4000-8000-000000000002");
    queue.remember(first);
    await assert.rejects(
      queue.flush(async () => ({ status: "saved", exchangeId: second.exchangeId })),
      /verified/,
    );
    assert.equal(queue.count, 1);
    const saved = [];
    await queue.flush(async (next) => {
      if (next.exchangeId === first.exchangeId) queue.remember(second);
      saved.push(next.exchangeId);
      return { status: "saved", exchangeId: next.exchangeId };
    });
    assert.deepEqual(saved, [first.exchangeId, second.exchangeId]);
    assert.equal(queue.count, 0);
  });

  it("sends only the signed receipt to the save-only route, never an Agent request", async () => {
    const receipt = pending();
    const result = await retryChatHistorySave(receipt, async (url, init) => {
      assert.equal(url, "/api/chat/conversations/retry");
      assert.equal(init.credentials, "same-origin");
      assert.equal(init.cache, "no-store");
      assert.deepEqual(JSON.parse(init.body), { recoveryToken: receipt.recoveryToken });
      return Response.json({ status: "saved", exchangeId: receipt.exchangeId });
    });
    assert.equal(result.exchangeId, receipt.exchangeId);
  });
});
