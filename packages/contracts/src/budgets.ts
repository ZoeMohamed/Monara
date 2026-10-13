import { z } from "zod";
import {
  budgetIdSchema,
  calendarDateSchema,
  categoryIdSchema,
  clientRequestIdSchema,
  isoDateTimeSchema,
  moneySchema,
  paginationInputSchema,
  positiveMoneySchema,
  reversibleActionReceiptSchema,
  signedMoneySchema,
} from "./common.ts";

export const budgetCadenceSchema = z.enum(["weekly", "monthly"]);
export const budgetWarningPercentSchema = z.number().int().min(1).max(100);

export const budgetSchema = z
  .object({
    id: budgetIdSchema,
    categoryId: categoryIdSchema,
    name: z.string().trim().min(1).max(100),
    cadence: budgetCadenceSchema,
    limit: positiveMoneySchema,
    warningPercent: budgetWarningPercentSchema,
    startsOn: calendarDateSchema,
    isActive: z.boolean(),
    deletedAt: isoDateTimeSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();

const budgetValuesShape = {
  categoryId: categoryIdSchema,
  name: z.string().trim().min(1).max(100),
  cadence: budgetCadenceSchema,
  limit: positiveMoneySchema,
  warningPercent: budgetWarningPercentSchema,
  startsOn: calendarDateSchema,
} as const;

export const createBudgetInputSchema = z
  .object({
    ...budgetValuesShape,
    warningPercent: budgetWarningPercentSchema.default(80),
    clientRequestId: clientRequestIdSchema,
  })
  .strict();

export const updateBudgetInputSchema = z
  .object({
    budgetId: budgetIdSchema,
    expectedUpdatedAt: isoDateTimeSchema,
    changes: z
      .object({
        ...budgetValuesShape,
        isActive: z.boolean(),
      })
      .partial()
      .strict(),
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

export const deleteBudgetInputSchema = z
  .object({
    budgetId: budgetIdSchema,
    expectedUpdatedAt: isoDateTimeSchema,
  })
  .strict();

export const listBudgetsInputSchema = paginationInputSchema
  .extend({
    cadence: budgetCadenceSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const budgetUsageStateSchema = z.enum(["on_track", "warning", "over"]);

export const budgetUsageSchema = z
  .object({
    budget: budgetSchema,
    periodStartsOn: calendarDateSchema,
    periodEndsOn: calendarDateSchema,
    used: moneySchema,
    remaining: signedMoneySchema,
    usagePercent: z.number().nonnegative(),
    state: budgetUsageStateSchema,
  })
  .strict();

export const budgetPageSchema = z
  .object({
    items: z.array(budgetSchema),
    nextCursor: z.string().min(1).max(512).nullable(),
  })
  .strict();

export const budgetSuggestionInputSchema = z
  .object({
    categoryId: categoryIdSchema,
    cadence: budgetCadenceSchema,
  })
  .strict();

export const budgetSuggestionSchema = z
  .object({
    categoryId: categoryIdSchema,
    cadence: budgetCadenceSchema,
    proposedLimit: positiveMoneySchema,
    basedOnStartsOn: calendarDateSchema,
    basedOnEndsOn: calendarDateSchema,
    confirmedIncome: moneySchema,
    confirmedSpending: moneySchema,
  })
  .strict();

export const budgetMutationResultSchema = z
  .object({
    budget: budgetSchema,
    action: reversibleActionReceiptSchema,
  })
  .strict();

export type BudgetCadence = z.infer<typeof budgetCadenceSchema>;
export type Budget = z.infer<typeof budgetSchema>;
export type CreateBudgetInput = z.input<typeof createBudgetInputSchema>;
export type UpdateBudgetInput = z.input<typeof updateBudgetInputSchema>;
export type DeleteBudgetInput = z.input<typeof deleteBudgetInputSchema>;
export type ListBudgetsInput = z.input<typeof listBudgetsInputSchema>;
export type BudgetUsage = z.infer<typeof budgetUsageSchema>;
export type BudgetPage = z.infer<typeof budgetPageSchema>;
export type BudgetSuggestionInput = z.input<typeof budgetSuggestionInputSchema>;
export type BudgetSuggestion = z.infer<typeof budgetSuggestionSchema>;
export type BudgetMutationResult = z.infer<typeof budgetMutationResultSchema>;
