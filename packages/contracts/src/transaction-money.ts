import { z } from "zod";
import { calendarDateSchema, type Money, positiveAmountMinorSchema } from "./common.ts";

export const transactionCurrencySchema = z.enum(["IDR", "USD"]);
export const transactionMoneySchema = z
  .object({
    amountMinor: positiveAmountMinorSchema,
    currency: transactionCurrencySchema,
  })
  .strict();

export const referenceRateSchema = z.string().regex(/^[1-9]\d{0,7}(?:\.\d{1,12})?$/);
export const fxSnapshotSchema = z
  .object({
    rate: referenceRateSchema,
    rateDate: calendarDateSchema,
    requestedOn: calendarDateSchema,
    source: z.literal("frankfurter_ecb"),
    rounding: z.literal("half_up_rupiah"),
  })
  .strict()
  .refine(
    (value) => value.rateDate <= value.requestedOn,
    "A rate cannot follow the transaction day.",
  );

export type TransactionMoney = z.infer<typeof transactionMoneySchema>;
export type FxSnapshot = z.infer<typeof fxSnapshotSchema>;

/** USD uses cents; the existing IDR ledger uses whole rupiah. Round exactly once. */
export function convertUsdToIdr(cents: string, rate: string): string {
  positiveAmountMinorSchema.parse(cents);
  referenceRateSchema.parse(rate);
  const [whole, fraction = ""] = rate.split(".");
  const scale = 10n ** BigInt(fraction.length);
  const numerator = BigInt(cents) * (BigInt(whole) * scale + BigInt(fraction || "0"));
  const denominator = 100n * scale;
  return positiveAmountMinorSchema.parse(
    ((numerator * 2n + denominator) / (denominator * 2n)).toString(),
  );
}

/** Every aggregate uses the persisted IDR value, never USD cents or a live rate. */
export function transactionReportingMoney(transaction: {
  money: TransactionMoney | null;
  idrMoney?: Money | null;
}): Money | null {
  if (transaction.money?.currency === "IDR") return { ...transaction.money, currency: "IDR" };
  return transaction.money?.currency === "USD" ? (transaction.idrMoney ?? null) : null;
}
