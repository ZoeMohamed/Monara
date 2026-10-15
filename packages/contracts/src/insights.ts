import { z } from "zod";
import {
  budgetIdSchema,
  calendarDateSchema,
  categoryIdSchema,
  moneySchema,
  signedMoneySchema,
  transactionIdSchema,
} from "./common.ts";

const categoryNameSchema = z.string().trim().min(1).max(100);

export const savingsRateInsightSchema = z
  .object({
    income: moneySchema,
    spending: moneySchema,
    difference: signedMoneySchema,
    ratePercent: z.number().finite().nullable(),
  })
  .strict();

export const safeToSpendBasisSchema = z
  .object({
    limit: moneySchema,
    spending: moneySchema,
    remaining: moneySchema,
    shortfall: moneySchema,
    remainingDays: z.number().int().positive(),
    dailyAmount: moneySchema,
  })
  .strict();

export const categorySafeToSpendSchema = safeToSpendBasisSchema
  .extend({
    budgetId: budgetIdSchema,
    categoryId: categoryIdSchema,
    categoryName: categoryNameSchema,
    periodStartsOn: calendarDateSchema,
    periodEndsOn: calendarDateSchema,
  })
  .strict();

export const overspendForecastSchema = z
  .object({
    budgetId: budgetIdSchema,
    categoryId: categoryIdSchema,
    categoryName: categoryNameSchema,
    periodStartsOn: calendarDateSchema,
    periodEndsOn: calendarDateSchema,
    elapsedDays: z.number().int().positive(),
    periodDays: z.number().int().positive(),
    limit: moneySchema,
    spending: moneySchema,
    projectedSpending: moneySchema,
    projectedOverspend: moneySchema,
  })
  .strict();

export const unusualTransactionInsightSchema = z
  .object({
    transactionId: transactionIdSchema,
    categoryId: categoryIdSchema,
    categoryName: categoryNameSchema,
    amount: moneySchema,
    historyMedian: moneySchema,
    historyTransactionCount: z.number().int().min(3),
    multipleOfMedian: z.number().finite().min(2),
  })
  .strict();

export const financialInsightsSchema = z
  .object({
    asOf: calendarDateSchema,
    savingsRate: savingsRateInsightSchema,
    safeToSpend: z
      .object({
        overall: safeToSpendBasisSchema.nullable(),
        byCategory: z.array(categorySafeToSpendSchema),
      })
      .strict(),
    overspendForecasts: z.array(overspendForecastSchema),
    unusualTransactions: z.array(unusualTransactionInsightSchema).max(10),
  })
  .strict();

export type FinancialInsights = z.infer<typeof financialInsightsSchema>;
export type SavingsRateInsight = z.infer<typeof savingsRateInsightSchema>;
export type SafeToSpendBasis = z.infer<typeof safeToSpendBasisSchema>;
export type CategorySafeToSpend = z.infer<typeof categorySafeToSpendSchema>;
export type OverspendForecast = z.infer<typeof overspendForecastSchema>;
export type UnusualTransactionInsight = z.infer<typeof unusualTransactionInsightSchema>;
