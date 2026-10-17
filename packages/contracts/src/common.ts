import { z } from "zod";

const MAX_MINOR_UNIT_DIGITS = 20;

export const userIdSchema = z.uuid();
export const financialAccountIdSchema = z.uuid();
export const categoryIdSchema = z.uuid();
export const transactionIdSchema = z.uuid();
export const budgetIdSchema = z.uuid();
export const recurringBillIdSchema = z.uuid();
export const reminderIdSchema = z.uuid();
export const gmailConnectionIdSchema = z.uuid();
export const actionIdSchema = z.uuid();
export const clientRequestIdSchema = z.string().trim().min(1).max(200);

export const currencySchema = z.literal("IDR");
export const amountMinorSchema = z
  .string()
  .regex(
    new RegExp(`^(?:0|[1-9]\\d{0,${MAX_MINOR_UNIT_DIGITS - 1}})$`),
    "Amount must be a non-negative integer in minor units.",
  );
export const positiveAmountMinorSchema = z
  .string()
  .regex(
    new RegExp(`^[1-9]\\d{0,${MAX_MINOR_UNIT_DIGITS - 1}}$`),
    "Amount must be a positive integer in minor units.",
  );
export const signedAmountMinorSchema = z
  .string()
  .regex(
    new RegExp(
      `^(?:0|[1-9]\\d{0,${MAX_MINOR_UNIT_DIGITS - 1}}|-[1-9]\\d{0,${MAX_MINOR_UNIT_DIGITS - 1}})$`,
    ),
    "Amount must be an integer in minor units.",
  );

export const moneySchema = z
  .object({
    amountMinor: amountMinorSchema,
    currency: currencySchema,
  })
  .strict();

export const positiveMoneySchema = z
  .object({
    amountMinor: positiveAmountMinorSchema,
    currency: currencySchema,
  })
  .strict();

export const signedMoneySchema = z
  .object({
    amountMinor: signedAmountMinorSchema,
    currency: currencySchema,
  })
  .strict();

export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Date must be a real calendar date.");

export const calendarMonthSchema = z
  .string()
  .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/, "Month must use YYYY-MM.");

export const localTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/, "Time must use HH:mm or HH:mm:ss.");

export const isoDateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
    "Timestamp must be ISO 8601 with a timezone.",
  )
  .refine(
    (value) => calendarDateSchema.safeParse(value.slice(0, 10)).success,
    "Timestamp must contain a real calendar date.",
  )
  .refine((value) => Number.isFinite(Date.parse(value)), "Timestamp must be valid.");

export const paginationInputSchema = z
  .object({
    cursor: z.string().min(1).max(512).nullable().optional(),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict();

export const operationErrorCodeSchema = z.enum([
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "DEPENDENCY_UNAVAILABLE",
  "RATE_LIMITED",
  "INTERNAL",
]);

export const operationErrorSchema = z
  .object({
    code: operationErrorCodeSchema,
    message: z.string().min(1).max(500),
    requestId: z.string().min(1).max(200).nullable(),
    fieldErrors: z.record(z.string(), z.array(z.string().min(1))).optional(),
  })
  .strict();

export const reversibleResourceTypeSchema = z.enum([
  "financial_account",
  "category",
  "transaction",
  "budget",
  "recurring_bill",
  "reminder_preferences",
]);

export const reversibleActionReceiptSchema = z
  .object({
    actionId: actionIdSchema,
    resourceType: reversibleResourceTypeSchema,
    resourceId: z.uuid(),
    changedAt: isoDateTimeSchema,
    undoExpiresAt: isoDateTimeSchema,
  })
  .strict();

export const undoActionInputSchema = z
  .object({
    actionId: actionIdSchema,
  })
  .strict();

export const undoActionResultSchema = z.object({ ok: z.literal(true) }).strict();

export const destructiveActionSchema = z.enum([
  "delete_transaction",
  "delete_budget",
  "delete_bill",
  "bulk_edit",
]);

export const destructiveActionConfirmationSchema = z
  .object({
    confirmationId: z.uuid(),
    action: destructiveActionSchema,
    resourceIds: z.array(z.uuid()).min(1).max(100),
    summary: z.string().trim().min(1).max(500),
    expiresAt: isoDateTimeSchema,
  })
  .strict();

export const confirmDestructiveActionInputSchema = z
  .object({
    confirmationId: z.uuid(),
    answer: z.literal("yes"),
  })
  .strict();

export type UserId = z.infer<typeof userIdSchema>;
export type FinancialAccountId = z.infer<typeof financialAccountIdSchema>;
export type CategoryId = z.infer<typeof categoryIdSchema>;
export type TransactionId = z.infer<typeof transactionIdSchema>;
export type BudgetId = z.infer<typeof budgetIdSchema>;
export type RecurringBillId = z.infer<typeof recurringBillIdSchema>;
export type ReminderId = z.infer<typeof reminderIdSchema>;
export type GmailConnectionId = z.infer<typeof gmailConnectionIdSchema>;
export type ActionId = z.infer<typeof actionIdSchema>;
export type ClientRequestId = z.infer<typeof clientRequestIdSchema>;
export type Money = z.infer<typeof moneySchema>;
export type PositiveMoney = z.infer<typeof positiveMoneySchema>;
export type SignedMoney = z.infer<typeof signedMoneySchema>;
export type OperationErrorCode = z.infer<typeof operationErrorCodeSchema>;
export type OperationError = z.infer<typeof operationErrorSchema>;
export type ReversibleResourceType = z.infer<typeof reversibleResourceTypeSchema>;
export type ReversibleActionReceipt = z.infer<typeof reversibleActionReceiptSchema>;
export type UndoActionInput = z.input<typeof undoActionInputSchema>;
export type DestructiveAction = z.infer<typeof destructiveActionSchema>;
export type DestructiveActionConfirmation = z.infer<typeof destructiveActionConfirmationSchema>;
export type ConfirmDestructiveActionInput = z.input<typeof confirmDestructiveActionInputSchema>;
