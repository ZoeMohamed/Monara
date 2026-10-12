import { z } from "zod";
import {
  calendarDateSchema,
  calendarMonthSchema,
  categoryIdSchema,
  clientRequestIdSchema,
  financialAccountIdSchema,
  gmailConnectionIdSchema,
  isoDateTimeSchema,
  localTimeSchema,
  paginationInputSchema,
  positiveMoneySchema,
  reversibleActionReceiptSchema,
  transactionIdSchema,
  userIdSchema,
} from "./common.ts";

export const transactionKindSchema = z.enum(["expense", "income", "transfer"]);
export const transactionReviewStatusSchema = z.enum(["pending", "confirmed", "rejected"]);
export const transactionSourceSchema = z.enum([
  "manual_form",
  "gmail_email",
  "in_app_chat",
  "whatsapp_text",
  "whatsapp_receipt",
  "whatsapp_voice",
]);

const transactionValuesShape = {
  kind: transactionKindSchema.nullable(),
  merchantName: z.string().trim().min(1).max(200).nullable(),
  money: positiveMoneySchema.nullable(),
  occurredOn: calendarDateSchema.nullable(),
  occurredTime: localTimeSchema.nullable(),
  description: z.string().trim().min(1).max(1_000).nullable(),
  location: z.string().trim().min(1).max(300).nullable(),
  accountHint: z.string().trim().min(1).max(200).nullable(),
  categoryId: categoryIdSchema.nullable(),
  financialAccountId: financialAccountIdSchema.nullable(),
  fromFinancialAccountId: financialAccountIdSchema.nullable(),
  toFinancialAccountId: financialAccountIdSchema.nullable(),
} as const;

export const transactionValuesSchema = z.object(transactionValuesShape).strict();

/** Adds cross-field issues that cannot be expressed by individual transaction fields. */
function validateTransactionValues(
  value: z.infer<typeof transactionValuesSchema> & { reviewStatus?: string },
  context: z.RefinementCtx,
): void {
  if (value.reviewStatus === "confirmed") {
    if (value.kind === null) {
      context.addIssue({
        code: "custom",
        path: ["kind"],
        message: "Confirmed transactions need a type.",
      });
    }
    if (value.money === null) {
      context.addIssue({
        code: "custom",
        path: ["money"],
        message: "Confirmed transactions need an amount.",
      });
    }
    if (value.occurredOn === null) {
      context.addIssue({
        code: "custom",
        path: ["occurredOn"],
        message: "Confirmed transactions need a date.",
      });
    }
  }

  if (value.kind === "transfer") {
    if (value.reviewStatus === "confirmed" && value.fromFinancialAccountId === null) {
      context.addIssue({
        code: "custom",
        path: ["fromFinancialAccountId"],
        message: "Confirmed transfers need a source Financial Account.",
      });
    }
    if (value.reviewStatus === "confirmed" && value.toFinancialAccountId === null) {
      context.addIssue({
        code: "custom",
        path: ["toFinancialAccountId"],
        message: "Confirmed transfers need a destination Financial Account.",
      });
    }
    if (
      value.fromFinancialAccountId !== null &&
      value.fromFinancialAccountId === value.toFinancialAccountId
    ) {
      context.addIssue({
        code: "custom",
        path: ["toFinancialAccountId"],
        message: "Transfer accounts must be different.",
      });
    }
    if (value.financialAccountId !== null) {
      context.addIssue({
        code: "custom",
        path: ["financialAccountId"],
        message: "Transfers use source and destination Financial Accounts.",
      });
    }
    return;
  }

  if (value.fromFinancialAccountId !== null || value.toFinancialAccountId !== null) {
    context.addIssue({
      code: "custom",
      path: ["fromFinancialAccountId"],
      message: "Only transfers use source and destination Financial Accounts.",
    });
  }
}

export const transactionSchema = z
  .object({
    id: transactionIdSchema,
    ...transactionValuesShape,
    reviewStatus: transactionReviewStatusSchema,
    source: transactionSourceSchema,
    confidence: z.number().min(0).max(1).nullable(),
    deletedAt: isoDateTimeSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict()
  .superRefine(validateTransactionValues);

export const confirmedTransactionValuesSchema = transactionValuesSchema.superRefine(
  (value, context) => validateTransactionValues({ ...value, reviewStatus: "confirmed" }, context),
);

export const createTransactionInputSchema = confirmedTransactionValuesSchema
  .extend({
    clientRequestId: clientRequestIdSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.merchantName === null && value.description === null) {
      context.addIssue({
        code: "custom",
        path: ["description"],
        message: "Direct transaction creates need a merchant, source, or description.",
      });
    }
    if (value.kind !== "transfer" && value.financialAccountId === null) {
      context.addIssue({
        code: "custom",
        path: ["financialAccountId"],
        message: "Direct transaction creates need a Financial Account.",
      });
    }
  });

const editableTransactionFieldsSchema = transactionValuesSchema.partial().strict();
const editableConfirmedTransactionFieldsSchema = transactionValuesSchema
  .extend({
    kind: transactionKindSchema,
    money: positiveMoneySchema,
    occurredOn: calendarDateSchema,
  })
  .partial()
  .strict();

export const updatePendingTransactionInputSchema = z
  .object({
    transactionId: transactionIdSchema,
    expectedUpdatedAt: isoDateTimeSchema,
    changes: editableTransactionFieldsSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (Object.keys(value.changes).length === 0) {
      context.addIssue({
        code: "custom",
        path: ["changes"],
        message: "At least one change is required.",
      });
    }
  });

export const updateTransactionInputSchema = z
  .object({
    transactionId: transactionIdSchema,
    expectedUpdatedAt: isoDateTimeSchema,
    changes: editableConfirmedTransactionFieldsSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (Object.keys(value.changes).length === 0) {
      context.addIssue({
        code: "custom",
        path: ["changes"],
        message: "At least one change is required.",
      });
    }
  });

export const confirmTransactionInputSchema = z
  .object({
    transactionId: transactionIdSchema,
    expectedUpdatedAt: isoDateTimeSchema,
    values: confirmedTransactionValuesSchema,
  })
  .strict();

export const rejectTransactionInputSchema = z
  .object({
    transactionId: transactionIdSchema,
    expectedUpdatedAt: isoDateTimeSchema,
  })
  .strict();

export const deleteTransactionInputSchema = z
  .object({
    transactionId: transactionIdSchema,
    expectedUpdatedAt: isoDateTimeSchema,
  })
  .strict();

export const listTransactionsInputSchema = paginationInputSchema
  .extend({
    reviewStatus: transactionReviewStatusSchema.optional(),
    kind: transactionKindSchema.optional(),
    month: calendarMonthSchema.optional(),
  })
  .strict();

export const transactionPageSchema = z
  .object({
    items: z.array(transactionSchema),
    nextCursor: z.string().min(1).max(512).nullable(),
  })
  .strict();

export const transactionMutationResultSchema = z
  .object({
    transaction: transactionSchema,
    action: reversibleActionReceiptSchema,
  })
  .strict();

export const gmailExtractionJobSchema = z
  .object({
    kind: z.literal("gmail.extract"),
    userId: userIdSchema,
    connectionId: gmailConnectionIdSchema,
    messageId: z.string().min(1).max(500),
  })
  .strict();

export type TransactionKind = z.infer<typeof transactionKindSchema>;
export type TransactionReviewStatus = z.infer<typeof transactionReviewStatusSchema>;
export type TransactionSource = z.infer<typeof transactionSourceSchema>;
export type TransactionValues = z.infer<typeof transactionValuesSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type CreateTransactionInput = z.input<typeof createTransactionInputSchema>;
export type UpdatePendingTransactionInput = z.input<typeof updatePendingTransactionInputSchema>;
export type UpdateTransactionInput = z.input<typeof updateTransactionInputSchema>;
export type ConfirmTransactionInput = z.input<typeof confirmTransactionInputSchema>;
export type RejectTransactionInput = z.input<typeof rejectTransactionInputSchema>;
export type DeleteTransactionInput = z.input<typeof deleteTransactionInputSchema>;
export type ListTransactionsInput = z.input<typeof listTransactionsInputSchema>;
export type TransactionPage = z.infer<typeof transactionPageSchema>;
export type TransactionMutationResult = z.infer<typeof transactionMutationResultSchema>;
export type GmailExtractionJob = z.infer<typeof gmailExtractionJobSchema>;
