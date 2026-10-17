// Offline diagnostic for the known F12 blocker. Requires Node 24.
// The assertions reproduce unsafe behavior; this is not an acceptance pass.
// No providers, network calls, real records, or credentials are used.
import assert from "node:assert/strict";
import { ConversationSession } from "../../apps/agent/src/whatsapp/session.ts";
import { createWhatsAppLinkService } from "../../packages/core/src/whatsapp-links.ts";

const userId = "7b0c0f0e-4f0f-4a4e-9f43-2f8e6f1c9a11";
const make = () => {
  const data = new Map();
  let link = { status: "verified", verifiedAt: "2026-10-16T10:00:00.000Z", phoneLastFour: "0001" };
  const calls = { respond: [], sent: [], failSend: false };
  const storage = {
    get: async (k) => structuredClone(data.get(k)),
    put: async (k, v) => void data.set(k, structuredClone(v)),
    delete: async (k) => data.delete(k),
    list: async ({ prefix }) =>
      new Map(
        [...data]
          .filter(([k]) => k.startsWith(prefix))
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, structuredClone(v)]),
      ),
    deleteAll: async () => data.clear(),
    setAlarm: async () => {},
  };
  const service = createWhatsAppLinkService({
    repository: {
      findByUser: async () => link,
      revoke: async () => {
        link = { ...link, status: "revoked" };
      },
    },
    secret: "synthetic-audit-secret",
  });
  const session = new ConversationSession({
    storage,
    now: () => 1000000,
    respond: async (input) => {
      calls.respond.push(input);
      return { reply: "Synthetic financial reply", actions: [], confirmation: null };
    },
    send: async (outbound) => {
      if (calls.failSend) throw new Error("Synthetic unavailable transport");
      calls.sent.push(outbound);
    },
  });
  const message = (id, to = "6281200000001") => ({
    userId,
    messageId: id,
    text: "Synthetic request",
    to,
    phoneNumberId: "synthetic-business",
  });
  return {
    service,
    session,
    calls,
    message,
    relink: () => {
      link = {
        ...link,
        status: "verified",
        phoneLastFour: "0002",
        verifiedAt: "2026-10-16T10:01:00.000Z",
      };
    },
  };
};
const queued = make();
await queued.session.receive(queued.message("synthetic-queued"));
await queued.service.unlink(userId);
assert.equal((await queued.service.status(userId)).status, "none");
await queued.session.drain();
assert.equal(queued.calls.respond.length, 1);
assert.equal(queued.calls.sent.length, 1);
const outbox = make();
outbox.calls.failSend = true;
await outbox.session.receive(outbox.message("synthetic-outbox"));
await assert.rejects(outbox.session.drain());
await outbox.service.unlink(userId);
outbox.calls.failSend = false;
await outbox.session.drain();
assert.equal(outbox.calls.respond.length, 1);
assert.equal(outbox.calls.sent.length, 1);
const relink = make();
await relink.session.receive(relink.message("synthetic-old-number"));
await relink.session.drain();
await relink.service.unlink(userId);
relink.relink();
await relink.session.receive(relink.message("synthetic-new-number", "6281200000002"));
await relink.session.drain();
assert.equal(relink.calls.respond[1].history.length, 2);
process.stdout.write(
  `${JSON.stringify(
    {
      outcome: "known F12 blocker reproduced",
      queuedAfterUnlink: {
        linkStatus: "none",
        respondCalls: queued.calls.respond.length,
        sendCalls: queued.calls.sent.length,
      },
      outboxAfterUnlink: {
        linkStatus: "none",
        respondCalls: outbox.calls.respond.length,
        sendCalls: outbox.calls.sent.length,
      },
      newNumberAfterRelink: { priorNumberHistoryTurns: relink.calls.respond[1].history.length },
      externalRequests: 0,
    },
    null,
    2,
  )}\n`,
);
