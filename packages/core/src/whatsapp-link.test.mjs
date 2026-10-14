import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkVerificationCode,
  createVerificationChallenge,
  MAX_VERIFICATION_ATTEMPTS,
  normalisePhone,
  protectPhone,
} from "./whatsapp-link.ts";

const secret = "test-link-secret";
const now = new Date("2026-10-13T10:00:00Z");

/** A pending link with a known code, as the backend would have stored it. */
async function pendingLink(phone = "+6281200000001") {
  const { phoneE164Hmac } = await protectPhone(phone, secret);
  const challenge = await createVerificationChallenge({ phoneE164Hmac, secret, now });
  return {
    code: challenge.code,
    link: {
      phoneE164Hmac,
      verificationCodeDigest: challenge.codeDigest,
      verificationExpiresAt: challenge.expiresAt,
      verificationAttempts: 0,
    },
  };
}

const wrong = (code) => (code === "000000" ? "000001" : "000000");

describe("normalisePhone", () => {
  it("accepts international numbers however they are spaced", () => {
    assert.equal(normalisePhone("+62 812-0000-0001"), "+6281200000001");
    assert.equal(normalisePhone("6281200000001"), "+6281200000001");
    assert.equal(normalisePhone(" +1 (415) 555-0100 "), "+14155550100");
  });

  it("rejects local, short, long, and non-numeric input instead of guessing a country", () => {
    for (const input of [
      "081200000001",
      "+62812",
      "+6281200000001234567",
      "call me",
      "",
      "+62abc",
    ]) {
      assert.equal(normalisePhone(input), null);
    }
  });
});

describe("protectPhone", () => {
  it("stores a keyed hash and the last four digits, never the number", async () => {
    const stored = await protectPhone("+6281200000001", secret);
    assert.match(stored.phoneE164Hmac, /^[0-9a-f]{64}$/);
    assert.equal(stored.phoneLastFour, "0001");
    assert.ok(!JSON.stringify(stored).includes("6281200000001"));
  });

  it("gives the same hash for the same number and a different one otherwise", async () => {
    const first = await protectPhone("+6281200000001", secret);
    assert.deepEqual(await protectPhone("+6281200000001", secret), first);
    assert.notEqual(
      (await protectPhone("+6281200000002", secret)).phoneE164Hmac,
      first.phoneE164Hmac,
    );
    assert.notEqual(
      (await protectPhone("+6281200000001", "other")).phoneE164Hmac,
      first.phoneE164Hmac,
    );
  });

  it("fails closed without a secret", async () => {
    await assert.rejects(protectPhone("+6281200000001", ""), /secret is required/);
  });
});

describe("createVerificationChallenge", () => {
  it("issues a six-digit code, stores only its digest, and expires in ten minutes", async () => {
    const { phoneE164Hmac } = await protectPhone("+6281200000001", secret);
    const challenge = await createVerificationChallenge({ phoneE164Hmac, secret, now });
    assert.match(challenge.code, /^\d{6}$/);
    assert.match(challenge.codeDigest, /^[0-9a-f]{64}$/);
    assert.ok(!challenge.codeDigest.includes(challenge.code));
    assert.equal(challenge.expiresAt, "2026-10-13T10:10:00.000Z");
  });
});

describe("checkVerificationCode", () => {
  it("verifies the right code", async () => {
    const { link, code } = await pendingLink();
    assert.deepEqual(await checkVerificationCode({ link, code, secret, now }), { verified: true });
  });

  it("counts a wrong code and locks the link at the attempt limit", async () => {
    const { link, code } = await pendingLink();
    assert.deepEqual(await checkVerificationCode({ link, code: wrong(code), secret, now }), {
      verified: false,
      reason: "incorrect",
      attempts: 1,
      locked: false,
    });
    const lastTry = { ...link, verificationAttempts: MAX_VERIFICATION_ATTEMPTS - 1 };
    assert.deepEqual(
      await checkVerificationCode({ link: lastTry, code: wrong(code), secret, now }),
      {
        verified: false,
        reason: "too_many_attempts",
        attempts: MAX_VERIFICATION_ATTEMPTS,
        locked: true,
      },
    );
  });

  it("refuses even the right code once the attempt limit is reached", async () => {
    const { link, code } = await pendingLink();
    const locked = { ...link, verificationAttempts: MAX_VERIFICATION_ATTEMPTS };
    const outcome = await checkVerificationCode({ link: locked, code, secret, now });
    assert.equal(outcome.verified, false);
    assert.equal(outcome.reason, "too_many_attempts");
  });

  it("refuses the right code after it expires, without using up an attempt", async () => {
    const { link, code } = await pendingLink();
    const later = new Date("2026-10-13T10:10:00Z");
    assert.deepEqual(await checkVerificationCode({ link, code, secret, now: later }), {
      verified: false,
      reason: "expired",
      attempts: 0,
      locked: false,
    });
  });

  it("does not accept a code issued for another number", async () => {
    const mine = await pendingLink("+6281200000001");
    const theirs = await pendingLink("+6281200000002");
    // Same code text, replayed against the other number's link digest.
    const replay = { ...theirs.link, verificationCodeDigest: mine.link.verificationCodeDigest };
    const outcome = await checkVerificationCode({ link: replay, code: mine.code, secret, now });
    assert.equal(outcome.verified, false);
  });
});
