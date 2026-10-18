import {
  DEFAULT_FORECAST_THRESHOLD,
  type ForecastCandidate,
  type ForecastJudgement,
  type ForecastSource,
  type ForecastSummary,
} from "@monara/contracts";
import {
  detectCandidates,
  forecastAccuracy,
  forecastTotals,
  type HistoryExpense,
  matchRealized,
  selectItems,
  toModelCandidates,
} from "./forecast.ts";

/** How far back the rules read. Matches the window the rules themselves use. */
const HISTORY_DAYS = 130;
const DAY_MS = 86_400_000;

interface StoredForecastRun {
  id: string;
  generatedAt: string;
  source: ForecastSource;
  month: string;
  threshold: number;
  usedModel: boolean;
  candidateCount: number;
  discardedCount: number;
}

interface StoredForecastItem {
  id: string;
  predictedOn: string;
  merchantName: string;
  categoryId: string | null;
  amount: number;
  amountLow: number;
  amountHigh: number;
  confidence: number;
  pattern: "monthly" | "weekly";
  reason: string;
}

interface NewForecastRun {
  source: ForecastSource;
  month: string;
  threshold: number;
  usedModel: boolean;
  candidateCount: number;
  discardedCount: number;
}

/** Storage for forecasts. Every call is scoped to one User, and the service never trusts a caller's id. */
export interface ForecastRepository {
  /** Confirmed expenses from `from` to `to`, both included. Never excluded, pending or deleted ones. */
  listConfirmedExpenses(userId: string, from: string, to: string): Promise<HistoryExpense[]>;
  /** Replaces the User's forecast with this one, atomically. */
  replaceForecast(
    userId: string,
    run: NewForecastRun,
    items: Omit<StoredForecastItem, "id">[],
  ): Promise<void>;
  latestForecast(
    userId: string,
  ): Promise<{ run: StoredForecastRun; items: StoredForecastItem[] } | null>;
}

/** Asks a model to judge candidates. Returns null when no model is available. */
export type RefineForecast = (
  candidates: ForecastCandidate[],
) => Promise<ForecastJudgement[] | null>;

const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
const fromDayNumber = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const money = (value: number) => ({
  amountMinor: String(Math.round(value)),
  currency: "IDR" as const,
});

/** The User's calendar date. Jakarta has no daylight saving, so one fixed offset is exact. */
export function jakartaDate(now: Date): string {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function createForecastService(input: {
  repository: ForecastRepository;
  refine?: RefineForecast;
  threshold?: number;
  /** A forecast made this recently is returned as it is instead of being made again. */
  cooldownMs?: number;
  now?: () => Date;
}) {
  const { repository, refine } = input;
  const threshold = input.threshold ?? DEFAULT_FORECAST_THRESHOLD;
  const now = input.now ?? (() => new Date());

  /** The stored forecast with its realized matches, totals and accuracy worked out for `today`. */
  async function read(userId: string, today: string): Promise<ForecastSummary | null> {
    const stored = await repository.latestForecast(userId);
    if (!stored) return null;
    const monthStart = `${today.slice(0, 7)}-01`;
    const runStart = `${stored.run.month}-01`;
    const expenses = await repository.listConfirmedExpenses(
      userId,
      runStart < monthStart ? runStart : monthStart,
      today,
    );
    // Only payments from the day the forecast was made count: earlier ones cannot have fulfilled it.
    const since = jakartaDate(new Date(stored.run.generatedAt));
    const matches = matchRealized(stored.items, expenses, today, since);
    const realizedBy = new Map(matches.map((match) => [match.itemIndex, match.transactionId]));
    const spentSoFar = expenses
      .filter((expense) => expense.occurredOn >= monthStart)
      .reduce((sum, expense) => sum + expense.amount, 0);
    const totals = forecastTotals(
      stored.items.map((item, index) => ({
        predictedOn: item.predictedOn,
        amount: item.amount,
        realized: realizedBy.has(index),
      })),
      spentSoFar,
      today,
    );
    return {
      runId: stored.run.id,
      generatedAt: stored.run.generatedAt,
      source: stored.run.source,
      month: stored.run.month,
      threshold: stored.run.threshold,
      usedModel: stored.run.usedModel,
      candidateCount: stored.run.candidateCount,
      discardedCount: stored.run.discardedCount,
      items: stored.items.map((item, index) => ({
        id: item.id,
        predictedOn: item.predictedOn,
        merchantName: item.merchantName,
        categoryId: item.categoryId,
        amount: money(item.amount),
        amountLow: money(item.amountLow),
        amountHigh: money(item.amountHigh),
        confidence: item.confidence,
        pattern: item.pattern,
        reason: item.reason,
        realizedTransactionId: realizedBy.get(index) ?? null,
      })),
      totals: {
        weekRemaining: money(totals.weekRemaining),
        monthRemaining: money(totals.monthRemaining),
        monthSpentSoFar: money(totals.monthSpentSoFar),
        projectedMonthEnd: money(totals.projectedMonthEnd),
      },
      accuracy: forecastAccuracy(stored.items, matches, today),
    };
  }

  return {
    /** The User's latest forecast for today, or null when none has been made. */
    get(userId: string): Promise<ForecastSummary | null> {
      return read(userId, jakartaDate(now()));
    },

    /** Makes a fresh forecast for the rest of this month and stores it in place of the old one. */
    async refresh(userId: string, source: ForecastSource): Promise<ForecastSummary> {
      const today = jakartaDate(now());
      if (input.cooldownMs) {
        const current = await read(userId, today);
        if (current && now().getTime() - Date.parse(current.generatedAt) < input.cooldownMs) {
          return current;
        }
      }
      const from = fromDayNumber(dayNumber(today) - HISTORY_DAYS);
      const history = await repository.listConfirmedExpenses(userId, from, today);
      const candidates = detectCandidates(history, today);

      let judgements: ForecastJudgement[] | null = null;
      if (refine && candidates.length > 0) {
        try {
          judgements = await refine(toModelCandidates(candidates));
        } catch {
          // The rules still stand without the model, so a model failure is not a refresh failure.
          judgements = null;
        }
      }
      const draft = selectItems(candidates, judgements, threshold);
      await repository.replaceForecast(
        userId,
        {
          source,
          month: today.slice(0, 7),
          threshold,
          usedModel: judgements !== null,
          candidateCount: draft.candidateCount,
          discardedCount: draft.discardedCount,
        },
        draft.items.map((item) => ({
          predictedOn: item.predictedOn,
          merchantName: item.merchantName,
          categoryId: item.categoryId,
          amount: item.amount,
          amountLow: item.amountLow,
          amountHigh: item.amountHigh,
          confidence: item.confidence,
          pattern: item.pattern,
          reason: item.reason,
        })),
      );
      const summary = await read(userId, today);
      if (!summary) throw new Error("The forecast was not saved.");
      return summary;
    },
  };
}

export type ForecastService = ReturnType<typeof createForecastService>;
