import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFinanceService } from "./finance.ts";

const userId = "d7000000-0000-4000-8000-000000000011";
const bankId = "d7000000-0000-4000-8000-000000000001";
const caller = { userId, channel: "web" };
const input = {
  bankId,
  clientRequestId: "custom-request",
  name: "Local bank",
  platform: "BANKING_APP",
  senderEmails: ["alerts@localbank.example"],
  logo: null,
  accountName: "Savings",
  lastFour: null,
  gmailConnectionId: null,
};
const now = "2026-10-20T00:00:00Z";
const bank = {
  id: bankId,
  key: "custom_d7000000000040008000000000000001",
  name: input.name,
  platform: input.platform,
  senderEmails: input.senderEmails,
  logo: null,
  createdAt: now,
  updatedAt: now,
};
const account = {
  id: "d7000000-0000-4000-8000-000000000021",
  name: "Savings",
  institution: bank.name,
  institutionKey: bank.key,
  institutionLogo: null,
  accountType: "bank",
  currency: "IDR",
  lastFour: null,
  gmailConnectionId: null,
  isActive: true,
  createdAt: now,
  updatedAt: now,
};
describe("custom bank backend boundary", () => {
  it("rejects built-in senders and forged owner fields before writing", async () => {
    let writes = 0;
    const service = createFinanceService({
      async createCustomBank() {
        writes++;
        return { customBank: bank, financialAccount: account };
      },
    });
    await assert.rejects(
      service.createCustomBank(caller, { ...input, senderEmails: ["BCA@BCA.CO.ID"] }),
      /already listed in Monara/,
    );
    await assert.rejects(
      service.createCustomBank(caller, {
        ...input,
        userId: "d7000000-0000-4000-8000-000000000012",
      }),
    );
    await assert.rejects(service.createCustomBank({ ...caller, channel: "whatsapp" }, input), {
      code: "FORBIDDEN",
    });
    assert.equal(writes, 0);
  });
  it("uses the verified caller identity for the atomic create operation", async () => {
    const service = createFinanceService({
      async createCustomBank(owner, values) {
        assert.equal(owner, userId);
        assert.equal(values.bankId, bankId);
        return { customBank: bank, financialAccount: account };
      },
    });
    const result = await service.createCustomBank(caller, input);
    assert.equal(result.financialAccount.institutionKey, result.customBank.key);
  });
  it("schedules sender-related work only when the source configuration changes", async () => {
    const service = createFinanceService({
      async listCustomBanks(owner) {
        assert.equal(owner, userId);
        return [bank];
      },
      async updateCustomBank(owner, values) {
        assert.equal(owner, userId);
        return { ...bank, name: values.name, senderEmails: values.senderEmails };
      },
    });
    const edit = {
      bankId,
      expectedUpdatedAt: now,
      name: "Corrected name",
      senderEmails: input.senderEmails,
      logo: null,
    };
    assert.equal((await service.updateCustomBank(caller, edit)).sendersChanged, false);
    assert.equal(
      (await service.updateCustomBank(caller, { ...edit, senderEmails: ["new@localbank.example"] }))
        .sendersChanged,
      true,
    );
  });
});
