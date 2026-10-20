import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createCustomBankInputSchema,
  customBankIdForKey,
  customBankKey,
  customBankListSchema,
  financialAccountSchema,
  institutionKeySchema,
  institutionSources,
  updateCustomBankInputSchema,
} from "./index.ts";

const bankId = "d7000000-0000-4000-8000-000000000001";
const input = {
  bankId,
  clientRequestId: "custom-test",
  name: "Local bank",
  platform: "BANKING_APP",
  senderEmails: ["alerts@localbank.example"],
  logo: null,
  accountName: "Savings",
  lastFour: "1234",
  gmailConnectionId: null,
};
describe("owned custom bank contracts", () => {
  it("normalizes exact senders and preserves a stable bank identity", () => {
    const parsed = createCustomBankInputSchema.parse({
      ...input,
      senderEmails: ["  Alerts@LocalBank.Example  "],
    });
    assert.deepEqual(parsed.senderEmails, input.senderEmails);
    assert.equal(customBankIdForKey(customBankKey(bankId)), bankId);
    assert.equal(institutionKeySchema.parse(customBankKey(bankId)), customBankKey(bankId));
    assert.equal(institutionKeySchema.safeParse("custom_not_an_id").success, false);
    assert.equal(customBankIdForKey("BCA_CC"), null);
  });
  it("rejects built-in senders, repeats, domains, query syntax, and arbitrary logos", () => {
    for (const senderEmails of [
      ["BCA@BCA.CO.ID"],
      ["alerts@localbank.example", "ALERTS@LOCALBANK.EXAMPLE"],
      ["@example.com"],
      ["x@example.com OR from:other@example.com"],
      [],
    ]) {
      assert.equal(
        createCustomBankInputSchema.safeParse({ ...input, senderEmails }).success,
        false,
      );
    }
    assert.match(
      createCustomBankInputSchema.safeParse({ ...input, senderEmails: ["bca@bca.co.id"] }).error
        .issues[0].message,
      /already listed in Monara/,
    );
    for (const logo of ["https://example.com/logo.svg", "brand:unknown", "si:../secret"])
      assert.equal(createCustomBankInputSchema.safeParse({ ...input, logo }).success, false);
    assert.equal(
      createCustomBankInputSchema.safeParse({ ...input, logo: "si:bankofamerica" }).success,
      true,
    );
  });
  it("does not turn syntax validation into owner authorization", () => {
    const bank = {
      key: customBankKey(bankId),
      name: "Local bank",
      provider: "Local bank",
      platform: "BANKING_APP",
      senderEmails: input.senderEmails,
    };
    assert.deepEqual(institutionSources([bank.key]), []);
    assert.deepEqual(
      institutionSources(["BCA_CC"], [bank]).map((entry) => entry.key),
      ["BCA_CC"],
    );
    assert.deepEqual(institutionSources([bank.key], [bank]), [bank]);
  });
  it("reads retired logos without accepting them as new choices", () => {
    const now = "2026-10-20T00:00:00Z";
    const bank = {
      id: bankId,
      key: customBankKey(bankId),
      name: input.name,
      platform: input.platform,
      senderEmails: input.senderEmails,
      logo: "brand:retired-bank",
      createdAt: now,
      updatedAt: now,
    };
    const account = {
      id: bankId,
      name: input.accountName,
      institution: bank.name,
      institutionKey: bank.key,
      institutionLogo: bank.logo,
      accountType: "bank",
      currency: "IDR",
      lastFour: null,
      gmailConnectionId: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    assert.equal(customBankListSchema.parse([bank])[0].logo, bank.logo);
    assert.equal(financialAccountSchema.parse(account).institutionLogo, bank.logo);
    assert.equal(
      createCustomBankInputSchema.safeParse({ ...input, logo: bank.logo }).success,
      false,
    );
    assert.equal(
      updateCustomBankInputSchema.safeParse({
        bankId,
        expectedUpdatedAt: now,
        name: bank.name,
        senderEmails: bank.senderEmails,
        logo: bank.logo,
      }).success,
      false,
    );
    for (const logo of ["https://example.com/logo.svg", "brand:../secret", "si:../../secret"]) {
      assert.equal(customBankListSchema.safeParse([{ ...bank, logo }]).success, false);
      assert.equal(
        financialAccountSchema.safeParse({ ...account, institutionLogo: logo }).success,
        false,
      );
    }
  });
  it("limits edits to metadata and requires the version", () => {
    const edit = {
      bankId,
      expectedUpdatedAt: "2026-10-20T00:00:00Z",
      name: "Corrected bank",
      senderEmails: input.senderEmails,
      logo: null,
    };
    assert.equal(updateCustomBankInputSchema.safeParse(edit).success, true);
    assert.equal(
      updateCustomBankInputSchema.safeParse({ ...edit, platform: "E_WALLET" }).success,
      false,
    );
    assert.equal(updateCustomBankInputSchema.safeParse({ ...edit, userId: bankId }).success, false);
  });
});
