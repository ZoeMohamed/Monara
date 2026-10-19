import { z } from "zod";
import {
  calendarDateSchema,
  clientRequestIdSchema,
  financialGoalIdSchema,
  isoDateTimeSchema,
  moneySchema,
  paginationInputSchema,
  positiveMoneySchema,
} from "./common.ts";

export const financialGoalStatusSchema = z.enum(["active", "completed"]);

export const financialGoalSchema = z
  .object({
    id: financialGoalIdSchema,
    name: z.string().trim().min(1).max(100),
    target: positiveMoneySchema,
    saved: moneySchema,
    targetDate: calendarDateSchema,
    status: financialGoalStatusSchema,
    imagePath: z.string().min(1).max(500).nullable(),
    deletedAt: isoDateTimeSchema.nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict()
  .superRefine((goal, context) => {
    if (BigInt(goal.saved.amountMinor) > BigInt(goal.target.amountMinor)) {
      context.addIssue({
        code: "custom",
        path: ["saved"],
        message: "Saved amount cannot exceed the target.",
      });
    }
    if ((goal.status === "completed") !== (goal.saved.amountMinor === goal.target.amountMinor)) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Goal status must match its progress.",
      });
    }
  });

const goalValues = {
  name: z.string().trim().min(1).max(100),
  target: positiveMoneySchema,
  saved: moneySchema,
  targetDate: calendarDateSchema,
} as const;

export const createFinancialGoalInputSchema = z
  .object({ ...goalValues, clientRequestId: clientRequestIdSchema })
  .strict()
  .superRefine((goal, context) => {
    if (BigInt(goal.saved.amountMinor) > BigInt(goal.target.amountMinor)) {
      context.addIssue({
        code: "custom",
        path: ["saved"],
        message: "Saved amount cannot exceed the target.",
      });
    }
  });

export const updateFinancialGoalInputSchema = z
  .object({
    goalId: financialGoalIdSchema,
    expectedUpdatedAt: isoDateTimeSchema,
    changes: z.object(goalValues).partial().strict(),
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

export const deleteFinancialGoalInputSchema = z
  .object({ goalId: financialGoalIdSchema, expectedUpdatedAt: isoDateTimeSchema })
  .strict();

export const listFinancialGoalsInputSchema = paginationInputSchema
  .extend({ status: financialGoalStatusSchema.optional() })
  .strict();

export const financialGoalPageSchema = z
  .object({
    items: z.array(financialGoalSchema),
    nextCursor: z.string().min(1).max(512).nullable(),
  })
  .strict();

export type FinancialGoal = z.infer<typeof financialGoalSchema>;
export type FinancialGoalPage = z.infer<typeof financialGoalPageSchema>;
export type CreateFinancialGoalInput = z.input<typeof createFinancialGoalInputSchema>;
export type UpdateFinancialGoalInput = z.input<typeof updateFinancialGoalInputSchema>;
export type DeleteFinancialGoalInput = z.input<typeof deleteFinancialGoalInputSchema>;
export type ListFinancialGoalsInput = z.input<typeof listFinancialGoalsInputSchema>;
