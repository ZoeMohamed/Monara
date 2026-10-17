import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { transactionAccount } from "./transaction-account.ts";

const daily = { id: "a-1", name: "Daily card", institution: "Bank Mandiri", accountType: "bank" };
const cash = { id: "a-2", name: "Cash", institution: null, accountType: "cash" };
const accounts = [daily, cash];

describe("transactionAccount", () => {
  it("finds the account by id even when its name is a nickname", () => {
    const found = transactionAccount({ financialAccountId: "a-1", method: "Daily card" }, accounts);
    assert.equal(found?.institution, "Bank Mandiri");
  });

  it("prefers the id over a different name", () => {
    const found = transactionAccount({ financialAccountId: "a-2", method: "Daily card" }, accounts);
    assert.equal(found?.id, "a-2");
  });

  it("falls back to the name when there is no id", () => {
    assert.equal(
      transactionAccount({ financialAccountId: null, method: "Cash" }, accounts)?.id,
      "a-2",
    );
    assert.equal(transactionAccount({ method: "Cash" }, accounts)?.id, "a-2");
  });

  it("returns nothing for an unknown account or no accounts", () => {
    assert.equal(
      transactionAccount({ financialAccountId: "x", method: "Nope" }, accounts),
      undefined,
    );
    assert.equal(
      transactionAccount({ financialAccountId: null, method: null }, accounts),
      undefined,
    );
    assert.equal(
      transactionAccount({ financialAccountId: "a-1", method: "Daily card" }, []),
      undefined,
    );
  });
});
