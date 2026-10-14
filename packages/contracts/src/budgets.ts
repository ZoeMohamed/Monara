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

/** Calendar interval for the date: monthly resets follow the chosen start day. */
export function budgetPeriodForDate(
  budget: Pick<Budget, "cadence" | "startsOn">,
  date: string,
): { startsOn: string; endsOn: string } | null {
  if (date < budget.startsOn) return null;
  const at = new Date(`${date}T00:00:00Z`);
  const iso = (value: Date) => {
    if (value.getUTCFullYear() < 0 || value.getUTCFullYear() > 9999) {
      throw new RangeError("Budget period extends beyond supported calendar dates.");
    }
    return value.toISOString().slice(0, 10);
  };
  const shiftDays = (value: Date, days: number) => {
    const result = new Date(value);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  };
  if (budget.cadence === "weekly") {
    const initial = new Date(`${budget.startsOn}T00:00:00Z`);
    const elapsed = (at.getTime() - initial.getTime()) / 86400000;
    const startsOn = shiftDays(initial, Math.floor(elapsed / 7) * 7);
    return { startsOn: iso(startsOn), endsOn: iso(shiftDays(startsOn, 6)) };
  }
  const anchorDay = Number(budget.startsOn.slice(8, 10));
  const anchor = (offset: number) => {
    const first = new Date(0);
    first.setUTCFullYear(at.getUTCFullYear(), at.getUTCMonth() + offset, 1);
    const last = new Date(first);
    last.setUTCMonth(last.getUTCMonth() + 1, 0);
    first.setUTCDate(Math.min(anchorDay, last.getUTCDate()));
    return first;
  };
  const offset = at < anchor(0) ? -1 : 0;
  return { startsOn: iso(anchor(offset)), endsOn: iso(shiftDays(anchor(offset + 1), -1)) };
}
