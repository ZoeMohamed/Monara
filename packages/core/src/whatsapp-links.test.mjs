import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FinanceOperationError } from "./finance.ts";
import { MAX_VERIFICATION_ATTEMPTS } from "./whatsapp-link.ts";
import { createWhatsAppLinkService } from "./whatsapp-links.ts";

const userA = "60000000-0000-4000-8000-000000000006";
const userB = "70000000-0000-4000-8000-000000000007";
const phone = "+62 812-0000-0001";
const sender = "+6281200000001";

function createMemoryLinks() {
  const rows = [];
  let sequence = 0;
  const byId = (id) => rows.find((row) => row.id === id);
  return {
    rows,
    repository: {
      async findByUser(userId) {
        const row = rows.find((candidate) => candidate.userId === userId);
        return row ? { ...row } : null;
      },
      async findActiveByPhone(phoneE164Hmac) {
        return rows
          .filter((row) => row.phoneE164Hmac === phoneE164Hmac && row.status !== "revoked")
          .map((row) => ({ ...row }));
      },
      async savePending(input) {
        const existing = rows.find((row) => row.userId === input.userId);
        const values = {
          phoneE164Hmac: input.phoneE164Hmac,
          phoneLastFour: input.phoneLastFour,
          status: "pending",
          verificationCodeDigest: input.codeDigest,
          verificationExpiresAt: input.expiresAt,
          verificationAttempts: 0,
          verifiedAt: null,
        };
        if (existing) Object.assign(existing, values);
        else rows.push({ id: String(++sequence), userId: input.userId, ...values });
      },
      async markVerified(input) {
        Object.assign(byId(input.id), {
          status: "verified",
          verificationCodeDigest: null,
          verificationExpiresAt: null,
          verificationAttempts: 0,
          verifiedAt: input.verifiedAt,
        });
      },
      async recordFailedAttempt(input) {
        const row = byId(input.id);
        row.verificationAttempts = input.attempts;
        if (input.revoke) {
          Object.assign(row, {
            status: "revoked",
            verificationCodeDigest: null,
            verificationExpiresAt: null,
          });
        }
      },
      async touchInbound() {},
      async revoke(userId) {
        const row = rows.find((candidate) => candidate.userId === userId);
        if (row) Object.assign(row, { status: "revoked", verificationCodeDigest: null });
      },
    },
  };
}

function setup() {
  const memory = createMemoryLinks();
  let clock = new Date("2026-10-16T10:00:00Z");
  const service = createWhatsAppLinkService({
    repository: memory.repository,
    secret: "test-link-secret",
    monaraNumber: "+1 205 596 7429",
    now: () => clock,
  });
  return {
    memory,
    service,
    advance: (ms) => {
      clock = new Date(clock.getTime() + ms);
    },
  };
}

const wrong = (code) => (code === "000000" ? "000001" : "000000");
const failsWith = (code) => (error) =>
  error instanceof FinanceOperationError && error.code === code;

describe("WhatsApp Link service", () => {
  it("links a number only after its code is sent from that number", async () => {
    const { service, memory } = setup();
    const started = await service.start(userA, { phone });
    assert.equal(started.phoneLastFour, "0001");
    assert.equal(started.sendTo, "+12055967429");
    assert.ok(!JSON.stringify(memory.rows).includes("81200000001"), "the plain number was stored");
    assert.equal((await service.status(userA)).status, "pending");

    assert.deepEqual(await service.resolveSender({ phoneE164: sender, verificationCode: null }), {
      status: "unlinked",
    });
    assert.deepEqual(
      await service.resolveSender({ phoneE164: "+6281299999999", verificationCode: started.code }),
      { status: "unlinked" },
    );
    assert.deepEqual(
      await service.resolveSender({ phoneE164: sender, verificationCode: started.code }),
      { status: "verified", userId: userA },
    );
    assert.deepEqual(await service.resolveSender({ phoneE164: sender, verificationCode: null }), {
      status: "linked",
      userId: userA,
    });
    assert.equal((await service.status(userA)).status, "verified");

    await service.unlink(userA);
    assert.deepEqual(await service.status(userA), { status: "none" });
    assert.deepEqual(await service.resolveSender({ phoneE164: sender, verificationCode: null }), {
      status: "unlinked",
    });
  });

  it("rejects wrong and expired codes and locks after too many attempts", async () => {
    const { service, advance } = setup();
    const started = await service.start(userA, { phone });
    for (let attempt = 1; attempt < MAX_VERIFICATION_ATTEMPTS; attempt++) {
      assert.deepEqual(
        await service.resolveSender({ phoneE164: sender, verificationCode: wrong(started.code) }),
        { status: "code_rejected", reason: "incorrect" },
      );
    }
    assert.deepEqual(
      await service.resolveSender({ phoneE164: sender, verificationCode: wrong(started.code) }),
      { status: "code_rejected", reason: "too_many_attempts" },
    );
    // Locked: even the right code no longer works.
    assert.deepEqual(
      await service.resolveSender({ phoneE164: sender, verificationCode: started.code }),
      { status: "unlinked" },
    );

    const restarted = await service.start(userA, { phone });
    advance(11 * 60 * 1000);
    assert.deepEqual(
      await service.resolveSender({ phoneE164: sender, verificationCode: restarted.code }),
      { status: "code_rejected", reason: "expired" },
    );
  });

  it("keeps one verified owner per number and fails closed without a secret", async () => {
    const { service } = setup();
    const started = await service.start(userA, { phone });
    await service.resolveSender({ phoneE164: sender, verificationCode: started.code });
    await assert.rejects(service.start(userB, { phone }), failsWith("CONFLICT"));
    await assert.rejects(
      service.start(userB, { phone: "0812 0000 0001" }),
      failsWith("VALIDATION_FAILED"),
    );

    const closed = createWhatsAppLinkService({
      repository: createMemoryLinks().repository,
      secret: "",
    });
    await assert.rejects(
      closed.resolveSender({ phoneE164: sender, verificationCode: null }),
      failsWith("DEPENDENCY_UNAVAILABLE"),
    );
  });
});
