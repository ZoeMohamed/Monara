import { z } from "zod";
import { budgetUsageSchema } from "./budgets.ts";
import {
  calendarDateSchema,
  calendarMonthSchema,
  categoryIdSchema,
  moneySchema,
  signedMoneySchema,
} from "./common.ts";
import { reminderSchema } from "./reminders.ts";
import { transactionSchema } from "./transactions.ts";

export const getDashboardInputSchema = z.object({ month: calendarMonthSchema }).strict();

export const dashboardCategoryTotalSchema = z
  .object({
    categoryId: categoryIdSchema.nullable(),
    categoryName: z.string().trim().min(1).max(100),
    total: moneySchema,
    sharePercent: z.number().min(0).max(100),
  })
  .strict();

export const dashboardPaceSchema = z
  .object({
    asOf: calendarDateSchema,
    elapsedDays: z.number().int().positive(),
    daysInMonth: z.number().int().min(28).max(31),
    averageDailySpending: moneySchema,
    projectedSpending: moneySchema,
  })
  .strict();

export const dashboardSummarySchema = z
  .object({
    month: calendarMonthSchema,
    income: moneySchema,
    spending: moneySchema,
    difference: signedMoneySchema,
    remainingBudget: signedMoneySchema,
    pace: dashboardPaceSchema,
    categoryBreakdown: z.array(dashboardCategoryTotalSchema),
    budgetUsage: z.array(budgetUsageSchema),
    recentTransactions: z.array(transactionSchema).max(10),
    activeReminders: z.array(reminderSchema).max(10),
  })
  .strict();

export type GetDashboardInput = z.input<typeof getDashboardInputSchema>;
export type DashboardCategoryTotal = z.infer<typeof dashboardCategoryTotalSchema>;
export type DashboardPace = z.infer<typeof dashboardPaceSchema>;
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
