import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { budgetAlertParameters, createBudgetAlertService } from "./budget-alerts.ts";
import { encryptPhone } from "./whatsapp-link.ts";

const secret = "test-link-secret";
const userA = "60000000-0000-4000-8000-000000000006";
const details = {
  budgetName: "Food",
  used: { amountMinor: "1290000", currency: "IDR" },
  limit: { amountMinor: "1500000", currency: "IDR" },
  periodEndsOn: "2026-10-31",
};
// 14:00 and 23:00 in Jakarta (UTC+7).
const afternoon = new Date("2026-10-17T07:00:00Z");
const lateNight = new Date("2026-10-17T16:00:00Z");

async function setup({ linked = true, at = afternoon, sendFails = false } = {}) {
  const deliveries = [];
  const sent = [];
  let clock = at;
  let sequence = 0;
  const phoneCiphertext = await encryptPhone("+6281200000001", secret);
  const repository = {
    async findRecipient(userId) {
      return linked && userId === userA ? { phoneCiphertext } : null;
    },
    async hasDelivery(userId, reminderId) {
      return deliveries.some((row) => row.userId === userId && row.reminderId === reminderId);
    },
    async countSentSince(userId, since) {
      return deliveries.filter(
        (row) => row.userId === userId && row.status === "sent" && row.attemptedAt >= since,
      ).length;
    },
    async createDelivery(input) {
      deliveries.push({ id: String(++sequence), ...input });
    },
    async listQueued(limit) {
      return deliveries.filter((row) => row.status === "queued").slice(0, limit);
    },
    async settleQueued({ id, outcome, attemptedAt }) {
      const row = deliveries.find((candidate) => candidate.id === id);
      if (row?.status !== "queued") return false;
      Object.assign(row, outcome, { attemptedAt });
      return true;
    },
  };
  const service = createBudgetAlertService({
    repository,
    describe: async (_userId, reminderId) => (reminderId === "gone" ? null : details),
    send: async (message) => {
      if (sendFails) throw new Error("Kapso said no to +6281200000001");
      sent.push(message);
      return { messageId: `wamid.${sent.length}` };
    },
    secret,
    now: () => clock,
  });
  return {
    service,
    deliveries,
    sent,
    setClock: (next) => {
      clock = next;
    },
  };
}

describe("WhatsApp budget alerts", () => {
  it("fills budget_alert in the template's order", () => {
    assert.deepEqual(budgetAlertParameters(details), [
      "86",
      "Food",
      "Rp 1.290.000",
      "Rp 1.500.000",
      "Rp 210.000",
      "31 Oct",
    ]);
    const over = budgetAlertParameters({
      ...details,
      used: { amountMinor: "1600000", currency: "IDR" },
    });
    assert.equal(over[0], "106");
    assert.equal(over[4], "Rp 0");
  });

  it("sends once to the verified number and records it", async () => {
    const { service, deliveries, sent } = await setup();
    assert.equal(await service.deliver(userA, "r1"), "sent");
    assert.equal(await service.deliver(userA, "r1"), null);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "+6281200000001");
    assert.equal(deliveries[0].status, "sent");
    assert.equal(deliveries[0].providerMessageId, "wamid.1");
  });

  it("sends nothing to an unlinked or opted-out User, and nothing without Kapso", async () => {
    const unlinked = await setup({ linked: false });
    assert.equal(await unlinked.service.deliver(userA, "r1"), null);
    assert.equal(unlinked.deliveries.length, 0);

    const closed = createBudgetAlertService({
      repository: {},
      describe: async () => details,
      send: undefined,
      secret,
    });
    assert.equal(await closed.deliver(userA, "r1"), null);
    assert.equal(await closed.dispatchQueued(), 0);
  });

  it("holds alerts during quiet hours and sends them after 07:00", async () => {
    const { service, deliveries, sent, setClock } = await setup({ at: lateNight });
    assert.equal(await service.deliver(userA, "r1"), "queued");
    assert.equal(sent.length, 0);
    assert.equal(await service.dispatchQueued(), 0, "dispatched during quiet hours");

    setClock(new Date("2026-10-18T00:30:00Z")); // 07:30 in Jakarta
    assert.equal(await service.dispatchQueued(), 1);
    assert.equal(sent.length, 1);
    assert.equal(deliveries[0].status, "sent");
    assert.equal(await service.dispatchQueued(), 0, "sent the same alert twice");
  });

  it("stops at three WhatsApp alerts a day", async () => {
    const { service, deliveries, sent, setClock } = await setup();
    for (const id of ["r1", "r2", "r3"]) assert.equal(await service.deliver(userA, id), "sent");
    assert.equal(await service.deliver(userA, "r4"), "skipped");
    assert.equal(deliveries[3].failureCode, "daily_limit");
    assert.equal(sent.length, 3);

    setClock(new Date("2026-10-18T07:00:00Z")); // the next day in Jakarta
    assert.equal(await service.deliver(userA, "r5"), "sent");
  });

  it("records a failed send without the provider's message, and skips a Reminder that is gone", async () => {
    const failing = await setup({ sendFails: true });
    assert.equal(await failing.service.deliver(userA, "r1"), "failed");
    assert.equal(failing.deliveries[0].failureCode, "send_failed");
    assert.ok(!JSON.stringify(failing.deliveries).includes("6281200000001"));

    const { service, deliveries } = await setup();
    assert.equal(await service.deliver(userA, "gone"), "skipped");
    assert.equal(deliveries[0].failureCode, "reminder_gone");
  });
});
