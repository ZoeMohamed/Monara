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

// Mirrors the database: one row per Reminder, claimed once, settled once.
function createMemoryDeliveries() {
  const rows = [];
  let sequence = 0;
  const byId = (id) => rows.find((row) => row.id === id);
  return {
    rows,
    async reserve({ userId, reminderId }) {
      const existing = rows.find((row) => row.reminderId === reminderId);
      if (existing) return existing.id;
      const id = String(++sequence);
      rows.push({ id, userId, reminderId, status: "queued", attemptedAt: null });
      return id;
    },
    async claim({ id, attemptedAt, reclaimBefore }) {
      const row = byId(id);
      if (
        row?.status !== "queued" ||
        (row.attemptedAt !== null && row.attemptedAt >= reclaimBefore)
      ) {
        return false;
      }
      row.attemptedAt = attemptedAt;
      return true;
    },
    async releaseClaim({ id, attemptedAt }) {
      const row = byId(id);
      if (row?.status === "queued" && row.attemptedAt === attemptedAt) row.attemptedAt = null;
    },
    async markSending({ id, attemptedAt }) {
      const row = byId(id);
      if (row?.status !== "queued" || row.attemptedAt !== attemptedAt) return false;
      row.status = "sending";
      return true;
    },
    async abandonStaleSending(before) {
      const stale = rows.filter(
        (row) => row.status === "sending" && row.attemptedAt !== null && row.attemptedAt < before,
      );
      for (const row of stale) {
        row.status = "failed";
        row.failureCode = "delivery_outcome_unknown";
      }
      return stale.length;
    },
    async countAttemptedSince(userId, since) {
      return rows.filter(
        (row) =>
          row.userId === userId &&
          (row.status === "sent" || row.status === "queued" || row.status === "sending") &&
          row.attemptedAt !== null &&
          row.attemptedAt >= since,
      ).length;
    },
    async settle({ id, outcome }) {
      const row = byId(id);
      if (row?.status === "queued" || row?.status === "sending") Object.assign(row, outcome);
    },
    async listQueued(limit, reclaimBefore) {
      return rows
        .filter(
          (row) =>
            row.status === "queued" &&
            (row.attemptedAt === null || row.attemptedAt < reclaimBefore),
        )
        .slice(0, limit);
    },
  };
}

async function setup({
  linked = true,
  at = afternoon,
  sendFails = false,
  describeFailsOnce = false,
} = {}) {
  const deliveries = createMemoryDeliveries();
  const sent = [];
  let clock = at;
  const phoneCiphertext = await encryptPhone("+6281200000001", secret);
  const service = createBudgetAlertService({
    repository: {
      ...deliveries,
      async findRecipient(userId) {
        return linked && userId === userA ? { phoneCiphertext } : null;
      },
    },
    describe: async (_userId, reminderId) => {
      if (describeFailsOnce) {
        describeFailsOnce = false;
        throw new Error("temporary database failure");
      }
      return reminderId === "gone" ? null : details;
    },
    send: async (message) => {
      // Yields like a network call, so concurrent deliveries interleave.
      await new Promise((resolve) => setImmediate(resolve));
      if (sendFails) throw new Error("Kapso said no to +6281200000001");
      sent.push(message);
      return { messageId: `wamid.${sent.length}` };
    },
    secret,
    now: () => clock,
  });
  return {
    service,
    deliveries: deliveries.rows,
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

  it("sends one alert when the same Reminder is delivered concurrently", async () => {
    const { service, sent } = await setup();
    const results = await Promise.all([
      service.deliver(userA, "r1"),
      service.deliver(userA, "r1"),
      service.deliver(userA, "r1"),
    ]);
    assert.equal(sent.length, 1);
    assert.deepEqual(results.filter(Boolean), ["sent"]);
  });

  it("never passes the daily limit when alerts race", async () => {
    const { service, sent } = await setup();
    await Promise.all(["r1", "r2", "r3", "r4", "r5", "r6"].map((id) => service.deliver(userA, id)));
    assert.ok(sent.length <= 3, `sent ${sent.length} alerts in one day`);
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
    const [first, second] = await Promise.all([service.dispatchQueued(), service.dispatchQueued()]);
    assert.equal(first + second, 1);
    assert.equal(sent.length, 1, "two dispatches sent the same alert");
    assert.equal(deliveries[0].status, "sent");
  });

  it("retries only stale work that never reached the provider", async () => {
    const beforeProvider = await setup({ describeFailsOnce: true });
    await assert.rejects(beforeProvider.service.deliver(userA, "r1"), /temporary database/);
    assert.equal(beforeProvider.deliveries[0].attemptedAt, null);
    assert.equal(await beforeProvider.service.deliver(userA, "r1"), "sent");
    assert.equal(beforeProvider.sent.length, 1);

    const staleClaim = await setup();
    const id = await staleClaim.service.deliver(userA, "quiet-placeholder");
    assert.equal(id, "sent");
    const row = staleClaim.deliveries[0];
    row.status = "queued";
    row.attemptedAt = "2026-10-17T06:00:00.000Z";
    staleClaim.sent.length = 0;
    assert.equal(await staleClaim.service.dispatchQueued(), 1);
    assert.equal(staleClaim.sent.length, 1);
  });

  it("never resends a stale row whose provider outcome is unknown", async () => {
    const { service, deliveries, sent } = await setup();
    await service.deliver(userA, "r1");
    deliveries[0].status = "sending";
    deliveries[0].attemptedAt = "2026-10-17T06:00:00.000Z";
    sent.length = 0;
    assert.equal(await service.dispatchQueued(), 0);
    assert.equal(deliveries[0].status, "failed");
    assert.equal(deliveries[0].failureCode, "delivery_outcome_unknown");
    assert.equal(sent.length, 0);
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
