import { z } from "zod";
import {
  calendarDateSchema,
  categoryIdSchema,
  moneySchema,
  transactionIdSchema,
} from "./common.ts";

/** Items below this confidence are dropped from a forecast and only counted. */
export const DEFAULT_FORECAST_THRESHOLD = 0.6;

export const forecastPatternSchema = z.enum(["monthly", "weekly"]);
export const forecastSourceSchema = z.enum(["manual", "weekly", "agent"]);

export const forecastItemSchema = z
  .object({
    id: z.uuid(),
    predictedOn: calendarDateSchema,
    merchantName: z.string().trim().min(1).max(200),
    categoryId: categoryIdSchema.nullable(),
    amount: moneySchema,
    amountLow: moneySchema,
    amountHigh: moneySchema,
    confidence: z.number().min(0).max(1),
    pattern: forecastPatternSchema,
    reason: z.string().trim().min(1).max(300),
    /** The confirmed payment that matched this prediction, once it has happened. */
    realizedTransactionId: transactionIdSchema.nullable(),
  })
  .strict();

export const forecastTotalsSchema = z
  .object({
    /** Predicted spending from today to the end of this week (Sunday). */
    weekRemaining: moneySchema,
    /** Predicted spending from today to the end of the month. */
    monthRemaining: moneySchema,
    /** Confirmed expenses so far this month. Predictions never count here. */
    monthSpentSoFar: moneySchema,
    /** Confirmed so far plus predicted for the rest of the month. */
    projectedMonthEnd: moneySchema,
  })
  .strict();

export const forecastAccuracySchema = z
  .object({
    /** Predictions whose date has passed. */
    due: z.number().int().nonnegative(),
    /** Of those, how many matched a confirmed payment. */
    realized: z.number().int().nonnegative(),
    /** Mean absolute error of the predicted amount among realized ones, in percent. */
    meanAbsoluteErrorPercent: z.number().nonnegative().nullable(),
  })
  .strict();

export const forecastSummarySchema = z
  .object({
    runId: z.uuid(),
    generatedAt: z.iso.datetime({ offset: true }),
    source: forecastSourceSchema,
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    threshold: z.number().min(0).max(1),
    /** False when the model step was unavailable and rule-based confidence was used. */
    usedModel: z.boolean(),
    /** Possible payments found, and how many fell below the threshold and were dropped. */
    candidateCount: z.number().int().nonnegative(),
    discardedCount: z.number().int().nonnegative(),
    items: z.array(forecastItemSchema),
    totals: forecastTotalsSchema,
    accuracy: forecastAccuracySchema,
  })
  .strict();

/** The answer when no forecast has been made yet. */
export const forecastResponseSchema = z
  .object({ forecast: forecastSummarySchema.nullable() })
  .strict();

export type ForecastItem = z.infer<typeof forecastItemSchema>;
export type ForecastSource = z.infer<typeof forecastSourceSchema>;
export type ForecastSummary = z.infer<typeof forecastSummarySchema>;
export type ForecastResponse = z.infer<typeof forecastResponseSchema>;

/** What the Agent runtime sends the model to judge, and what it gets back. */
export const forecastCandidateSchema = z
  .object({
    key: z.string().min(1).max(100),
    merchantName: z.string().trim().min(1).max(200),
    pattern: forecastPatternSchema,
    /** The confidence the rules gave it, from 0 to 1. */
    ruleConfidence: z.number().min(0).max(1),
    /** Whole-rupiah amounts of the earlier payments, oldest first, capped. */
    amounts: z.array(z.number().int().positive()).min(1).max(24),
    /** Dates of the earlier payments, oldest first, capped. */
    dates: z.array(calendarDateSchema).min(1).max(24),
    /** The dates the rules expect the next payments on. */
    predictedOn: z.array(calendarDateSchema).min(1).max(31),
  })
  .strict();

export const forecastRefineRequestSchema = z
  .object({ candidates: z.array(forecastCandidateSchema).min(1).max(40) })
  .strict();

export const forecastJudgementSchema = z
  .object({
    key: z.string().min(1).max(100),
    confidence: z.number().min(0).max(1),
    reason: z.string().trim().min(1).max(300),
  })
  .strict();

export const forecastRefineResponseSchema = z
  .object({ judgements: z.array(forecastJudgementSchema).max(40) })
  .strict();

export type ForecastCandidate = z.infer<typeof forecastCandidateSchema>;
export type ForecastJudgement = z.infer<typeof forecastJudgementSchema>;
