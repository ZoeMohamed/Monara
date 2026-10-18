import { z } from "zod";
import {
  calendarDateSchema,
  calendarMonthSchema,
  categoryIdSchema,
  clientRequestIdSchema,
  financialAccountIdSchema,
  isoDateTimeSchema,
  localTimeSchema,
  paginationInputSchema,
  positiveMoneySchema,
  reversibleActionReceiptSchema,
  transactionIdSchema,
} from "./common.ts";

export const transactionKindSchema = z.enum(["expense", "income", "exclusion"]);
export const transactionFlowDirectionSchema = z.enum(["in", "out"]);
export const transactionReviewStatusSchema = z.enum(["pending", "confirmed"]);
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
  /** Cash direction, retained for exclusions even though they do not affect totals. */
  flowDirection: transactionFlowDirectionSchema.nullable().optional(),
  merchantName: z.string().trim().min(1).max(200).nullable(),
  money: positiveMoneySchema.nullable(),
  occurredOn: calendarDateSchema.nullable(),
  occurredTime: localTimeSchema.nullable(),
  description: z.string().trim().min(1).max(1_000).nullable(),
  location: z.string().trim().min(1).max(300).nullable(),
  accountHint: z.string().trim().min(1).max(200).nullable(),
  categoryId: categoryIdSchema.nullable(),
  financialAccountId: financialAccountIdSchema.nullable(),
} as const;

export const transactionValuesSchema = z.object(transactionValuesShape).strict();

/** Adds cross-field issues that cannot be expressed by individual transaction fields. */
function validateTransactionValues(
  value: z.infer<typeof transactionValuesSchema> & { reviewStatus?: string },
  context: z.RefinementCtx,
): void {
  const expectedDirection =
    value.kind === "expense" ? "out" : value.kind === "income" ? "in" : null;
  if (
    (expectedDirection !== null &&
      value.flowDirection != null &&
      value.flowDirection !== expectedDirection) ||
    (value.kind === null && value.flowDirection != null)
  ) {
    context.addIssue({
      code: "custom",
      path: ["flowDirection"],
      message: "The cash direction does not match the transaction type.",
    });
  }
  if (value.reviewStatus === "confirmed") {
    if (value.kind === null) {
      context.addIssue({
        code: "custom",
        path: ["kind"],
        message: "Confirmed transactions need a type.",
      });
    }
    if (value.kind !== "exclusion" && value.money === null) {
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
    if (value.money === null) {
      context.addIssue({
        code: "custom",
        path: ["money"],
        message: "Direct transaction creates need an amount.",
      });
    }
    if (value.occurredOn === null) {
      context.addIssue({
        code: "custom",
        path: ["occurredOn"],
        message: "Direct transaction creates need a date.",
      });
    }
    if (value.merchantName === null && value.description === null) {
      context.addIssue({
        code: "custom",
        path: ["description"],
        message: "Direct transaction creates need a merchant, source, or description.",
      });
    }
    if (value.financialAccountId === null) {
      context.addIssue({
        code: "custom",
        path: ["financialAccountId"],
        message: "Direct transaction creates need a Financial Account.",
      });
    }
  });

/**
 * A transaction read from a receipt photo sent on WhatsApp (PRD F14). It is
 * always created pending, so the User reviews it before it counts.
 */
export const addReceiptTransactionInputSchema = z
  .object({
    clientRequestId: clientRequestIdSchema,
    values: transactionValuesSchema,
    confidence: z.number().min(0).max(1).nullable(),
  })
  .strict();

export type AddReceiptTransactionInput = z.infer<typeof addReceiptTransactionInputSchema>;

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

export const excludeTransactionInputSchema = z
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

export type TransactionKind = z.infer<typeof transactionKindSchema>;
export type TransactionFlowDirection = z.infer<typeof transactionFlowDirectionSchema>;
export type TransactionReviewStatus = z.infer<typeof transactionReviewStatusSchema>;
export type TransactionSource = z.infer<typeof transactionSourceSchema>;
export type TransactionValues = z.infer<typeof transactionValuesSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type CreateTransactionInput = z.input<typeof createTransactionInputSchema>;
export type UpdatePendingTransactionInput = z.input<typeof updatePendingTransactionInputSchema>;
export type UpdateTransactionInput = z.input<typeof updateTransactionInputSchema>;
export type ConfirmTransactionInput = z.input<typeof confirmTransactionInputSchema>;
export type ExcludeTransactionInput = z.input<typeof excludeTransactionInputSchema>;
export type DeleteTransactionInput = z.input<typeof deleteTransactionInputSchema>;
export type ListTransactionsInput = z.input<typeof listTransactionsInputSchema>;
export type TransactionPage = z.infer<typeof transactionPageSchema>;
export type TransactionMutationResult = z.infer<typeof transactionMutationResultSchema>;
