import assert from "node:assert/strict";
import test from "node:test";
import {
  convertUsdToIdr,
  transactionMoneySchema,
  transactionReportingMoney,
} from "./transaction-money.ts";
import { createTransactionInputSchema, transactionSchema } from "./transactions.ts";

test("USD cents convert with exact half-up whole-rupiah rounding", () => {
  assert.equal(convertUsdToIdr("1999", "16500.123456"), "329837");
  assert.equal(convertUsdToIdr("1", "15050"), "151");
  assert.equal(convertUsdToIdr("1", "15049.999999"), "150");
  assert.equal(convertUsdToIdr("2000", "18031"), "360620");
});

test("reporting never treats USD cents as rupiah or unavailable conversion as zero", () => {
  const money = { currency: "USD", amountMinor: "2000" };
  assert.equal(transactionReportingMoney({ money }), null);
  assert.deepEqual(
    transactionReportingMoney({ money, idrMoney: { currency: "IDR", amountMinor: "360620" } }),
    { currency: "IDR", amountMinor: "360620" },
  );
  assert.equal(
    transactionMoneySchema.safeParse({ currency: "SGD", amountMinor: "2000" }).success,
    false,
  );
});

test("transaction reads reject unvalued confirmed USD and write inputs reject caller-supplied FX", () => {
  const values = {
    kind: "expense",
    flowDirection: "out",
    merchantName: "Synthetic subscription",
    money: { currency: "USD", amountMinor: "1999" },
    occurredOn: "2026-10-11",
    occurredTime: null,
    description: null,
    location: null,
    accountHint: null,
    categoryId: null,
    financialAccountId: "10000000-0000-4000-8000-000000000001",
  };
  const record = {
    ...values,
    id: "10000000-0000-4000-8000-000000000002",
    source: "manual_form",
    reviewStatus: "confirmed",
    confidence: null,
    deletedAt: null,
    createdAt: "2026-10-11T00:00:00Z",
    updatedAt: "2026-10-11T00:00:00Z",
  };
  assert.equal(transactionSchema.safeParse(record).success, false);
  assert.equal(transactionSchema.safeParse({ ...record, reviewStatus: "pending" }).success, true);
  assert.equal(
    transactionSchema.safeParse({ ...record, idrMoney: { currency: "IDR", amountMinor: "329837" } })
      .success,
    true,
  );
  assert.equal(
    createTransactionInputSchema.safeParse({
      ...values,
      clientRequestId: "synthetic",
      idrMoney: { currency: "IDR", amountMinor: "1" },
    }).success,
    false,
  );
});
