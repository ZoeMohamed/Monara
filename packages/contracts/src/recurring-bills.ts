import { z } from "zod";
import {
  calendarDateSchema,
  clientRequestIdSchema,
  financialAccountIdSchema,
  isoDateTimeSchema,
  paginationInputSchema,
  positiveMoneySchema,
  recurringBillIdSchema,
  reversibleActionReceiptSchema,
} from "./common.ts";

export const recurringBillIntervalUnitSchema = z.enum(["day", "week", "month"]);
export const recurringBillStatusSchema = z.enum(["active", "dismissed"]);

const httpsUrlSchema = z
  .url()
  .max(2_000)
  .regex(/^https:\/\//i, "Cancellation URLs must use HTTPS.");

const recurringBillValuesShape = {
  financialAccountId: financialAccountIdSchema.nullable(),
  merchantName: z.string().trim().min(1).max(200),
  expectedAmount: positiveMoneySchema,
  intervalCount: z.number().int().min(1).max(365),
  intervalUnit: recurringBillIntervalUnitSchema,
  nextDueOn: calendarDateSchema,
  cancellationUrl: httpsUrlSchema.nullable(),
} as const;

export const recurringBillSchema = z
  .object({
    id: recurringBillIdSchema,
    ...recurringBillValuesShape,
    status: recurringBillStatusSchema,
    confidence: z.number().min(0).max(1).nullable(),
    deletedAt: isoDateTimeSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export const recurringBillProposalSchema = z
  .object({
    ...recurringBillValuesShape,
    confidence: z.number().min(0).max(1).nullable(),
  })
  .strict();

export const updateRecurringBillInputSchema = z
  .object({
    recurringBillId: recurringBillIdSchema,
    expectedUpdatedAt: isoDateTimeSchema,
    changes: z.object(recurringBillValuesShape).partial().strict(),
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

export const confirmRecurringBillInputSchema = z
  .object({
    clientRequestId: clientRequestIdSchema,
    proposal: recurringBillProposalSchema,
  })
  .strict();

export const dismissRecurringBillInputSchema = z
  .object({
    recurringBillId: recurringBillIdSchema,
    expectedUpdatedAt: isoDateTimeSchema,
  })
  .strict();

export const deleteRecurringBillInputSchema = z
  .object({
    recurringBillId: recurringBillIdSchema,
    expectedUpdatedAt: isoDateTimeSchema,
  })
  .strict();

export const listRecurringBillsInputSchema = paginationInputSchema
  .extend({ status: recurringBillStatusSchema.optional() })
  .strict();

export const recurringBillPageSchema = z
  .object({
    items: z.array(recurringBillSchema),
    nextCursor: z.string().min(1).max(512).nullable(),
  })
  .strict();

export const recurringBillMutationResultSchema = z
  .object({
    recurringBill: recurringBillSchema,
    action: reversibleActionReceiptSchema,
  })
  .strict();

export type RecurringBillIntervalUnit = z.infer<typeof recurringBillIntervalUnitSchema>;
export type RecurringBillStatus = z.infer<typeof recurringBillStatusSchema>;
export type RecurringBill = z.infer<typeof recurringBillSchema>;
export type RecurringBillProposal = z.infer<typeof recurringBillProposalSchema>;
export type UpdateRecurringBillInput = z.input<typeof updateRecurringBillInputSchema>;
export type ConfirmRecurringBillInput = z.input<typeof confirmRecurringBillInputSchema>;
export type DismissRecurringBillInput = z.input<typeof dismissRecurringBillInputSchema>;
export type DeleteRecurringBillInput = z.input<typeof deleteRecurringBillInputSchema>;
export type ListRecurringBillsInput = z.input<typeof listRecurringBillsInputSchema>;
export type RecurringBillPage = z.infer<typeof recurringBillPageSchema>;
export type RecurringBillMutationResult = z.infer<typeof recurringBillMutationResultSchema>;
