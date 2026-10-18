// Spending forecast (PRD F17). Rules read the User's confirmed expenses and propose the payments
// they expect for the rest of the month: bills that repeat on a day of the month, and habits that
// repeat on days of the week. A model may then judge each candidate's confidence, but it can only
// move that confidence within a small band and write a reason. It never adds an item or an amount,
// so a forecast is always built from payments the User really made. Forecasts are predictions and
// never count in confirmed totals.
import {
  DEFAULT_FORECAST_THRESHOLD,
  type ForecastCandidate,
  type ForecastJudgement,
} from "@monara/contracts";

/** A confirmed expense, reduced to what the rules need. */
export interface HistoryExpense {
  id: string;
  /** YYYY-MM-DD in the User's calendar. */
  occurredOn: string;
  merchantName: string | null;
  categoryId: string | null;
  /** Whole rupiah. */
  amount: number;
}

interface PredictedPayment {
  predictedOn: string;
  amount: number;
  amountLow: number;
  amountHigh: number;
}

/** A recurring payment the rules found, before any confidence threshold is applied. */
export interface RuleCandidate {
  key: string;
  merchantName: string;
  categoryId: string | null;
  pattern: "monthly" | "weekly";
  ruleConfidence: number;
  /** Why the rules expect it, in plain words. */
  reason: string;
  amounts: number[];
  dates: string[];
  payments: PredictedPayment[];
}

interface ForecastItemDraft extends PredictedPayment {
  merchantName: string;
  categoryId: string | null;
  pattern: "monthly" | "weekly";
  confidence: number;
  reason: string;
}

/** How far the model may move the rule confidence: down more than up, so it errs toward silence. */
const MAX_DROP = 0.25;
const MAX_RISE = 0.15;
/** How far ahead the forecast looks: the next 30 days, so it can cross into next month. */
const FORECAST_HORIZON_DAYS = 30;
const HISTORY_DAYS = 130;
const MONTHLY_RECENT_DAYS = 45;
const WEEKLY_WINDOW_DAYS = 56;
const WEEKLY_MIN_HITS = 4;
const DAY_MS = 86_400_000;
const WEEKDAYS = [
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
  "Sundays",
];

// ---- dates (all calendar days in UTC, so there is no daylight saving to trip over) ----

const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
const fromDayNumber = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
/** Monday is 1 and Sunday is 7. */
const isoWeekday = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
const monthOf = (date: string) => date.slice(0, 7);
const dayOfMonth = (date: string) => Number(date.slice(8, 10));

function daysInMonth(month: string): number {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, number ?? 1, 0)).getUTCDate();
}

export const endOfMonth = (date: string) =>
  `${monthOf(date)}-${String(daysInMonth(monthOf(date))).padStart(2, "0")}`;
const horizonEndOf = (today: string) => fromDayNumber(dayNumber(today) + FORECAST_HORIZON_DAYS);
function nextMonth(month: string): string {
  const [year, number] = month.split("-").map(Number);
  return number === 12
    ? `${(year ?? 0) + 1}-01`
    : `${year}-${String((number ?? 0) + 1).padStart(2, "0")}`;
}

/** The Sunday that ends the week `date` falls in. */
export const endOfWeek = (date: string) => fromDayNumber(dayNumber(date) + (7 - isoWeekday(date)));

function ordinal(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  return `${value}${{ 1: "st", 2: "nd", 3: "rd" }[value % 10] ?? "th"}`;
}

function listWords(words: string[]): string {
  return words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

// ---- small statistics ----

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

/** 1 when every amount is the same, falling to 0 as the spread reaches half the mean. */
function amountStability(amounts: number[]): number {
  const mean = amounts.reduce((sum, value) => sum + value, 0) / amounts.length;
  if (mean <= 0) return 0;
  const variance = amounts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / amounts.length;
  return Math.max(0, Math.min(1, 1 - (2 * Math.sqrt(variance)) / mean));
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** A merchant name reduced to letters, so "SPOTIFY AB 123" and "Spotify" group together. */
export function merchantKey(name: string | null): string | null {
  if (!name) return null;
  const key = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return key.length > 0 ? key.slice(0, 100) : null;
}

function paymentRange(amounts: number[]): {
  amount: number;
  amountLow: number;
  amountHigh: number;
} {
  const recent = amounts.slice(-6);
  return {
    amount: Math.round(median(recent)),
    amountLow: Math.min(...recent),
    amountHigh: Math.max(...recent),
  };
}

interface Group {
  key: string;
  expenses: HistoryExpense[];
}

function groupByMerchant(history: HistoryExpense[], today: string): Group[] {
  const oldest = dayNumber(today) - HISTORY_DAYS;
  const groups = new Map<string, HistoryExpense[]>();
  for (const expense of history) {
    const key = merchantKey(expense.merchantName);
    const day = dayNumber(expense.occurredOn);
    if (!key || !(expense.amount > 0) || day < oldest || day >= dayNumber(today)) continue;
    groups.set(key, [...(groups.get(key) ?? []), expense]);
  }
  return [...groups].map(([key, expenses]) => ({
    key,
    expenses: expenses.sort((a, b) => a.occurredOn.localeCompare(b.occurredOn)),
  }));
}

function displayName(expenses: HistoryExpense[]): string {
  const counts = new Map<string, number>();
  for (const expense of expenses) {
    const name = expense.merchantName?.trim();
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Unknown";
}

function monthlyCandidate(
  group: Group,
  today: string,
  paidToday: Set<string>,
): RuleCandidate | null {
  const { expenses } = group;
  const months = new Set(expenses.map((expense) => monthOf(expense.occurredOn)));
  // Once a month, in at least two different months, and recently enough to still be live.
  if (months.size < 2 || expenses.length > months.size + 1) return null;
  const last = expenses.at(-1);
  if (!last || dayNumber(today) - dayNumber(last.occurredOn) > MONTHLY_RECENT_DAYS) return null;

  const days = expenses.map((expense) => dayOfMonth(expense.occurredOn));
  const usual = Math.round(median(days));
  const consistency = days.filter((day) => Math.abs(day - usual) <= 2).length / days.length;
  if (consistency < 0.66) return null;

  const amounts = expenses.map((expense) => expense.amount);
  const confidence =
    0.4 * consistency + 0.3 * amountStability(amounts) + 0.3 * Math.min(1, months.size / 4);

  const thisMonth = monthOf(today);
  const horizonEnd = horizonEndOf(today);
  const range = paymentRange(amounts);
  const payments: PredictedPayment[] = [];
  for (let month = thisMonth; month <= monthOf(horizonEnd); month = nextMonth(month)) {
    // A payment already made this month is not expected again this month.
    if (month === thisMonth && (months.has(thisMonth) || paidToday.has(group.key))) continue;
    const date = `${month}-${String(Math.min(usual, daysInMonth(month))).padStart(2, "0")}`;
    if (date >= today && date <= horizonEnd) payments.push({ predictedOn: date, ...range });
  }
  return { ...baseOf(group, "monthly", confidence, months.size, usual), payments };
}

function baseOf(
  group: Group,
  pattern: "monthly" | "weekly",
  confidence: number,
  count: number,
  detail: number | string[],
) {
  const reason =
    pattern === "monthly"
      ? `Paid around the ${ordinal(detail as number)} in each of the last ${count} months.`
      : `Bought on ${listWords(detail as string[])} in ${count} of the last 8 weeks.`;
  return {
    key: group.key,
    merchantName: displayName(group.expenses),
    categoryId:
      [...group.expenses].reverse().find((expense) => expense.categoryId)?.categoryId ?? null,
    pattern,
    ruleConfidence: round3(clamp(confidence, 0, 1)),
    reason,
    amounts: group.expenses.map((expense) => expense.amount).slice(-24),
    dates: group.expenses.map((expense) => expense.occurredOn).slice(-24),
  };
}

function weeklyCandidate(
  group: Group,
  today: string,
  paidToday: Set<string>,
): RuleCandidate | null {
  const windowStart = dayNumber(today) - WEEKLY_WINDOW_DAYS;
  const recent = group.expenses.filter((expense) => dayNumber(expense.occurredOn) >= windowStart);
  const byWeekday = new Map<number, HistoryExpense[]>();
  for (const expense of recent) {
    const weekday = isoWeekday(expense.occurredOn);
    byWeekday.set(weekday, [...(byWeekday.get(weekday) ?? []), expense]);
  }
  const weeks = WEEKLY_WINDOW_DAYS / 7;
  // A weekday counts once the merchant shows up on it in at least half of the weeks.
  const usual = [...byWeekday]
    .map(([weekday, list]) => ({
      weekday,
      list,
      weeksHit: new Set(list.map((e) => Math.floor((dayNumber(e.occurredOn) - windowStart) / 7)))
        .size,
    }))
    .filter((entry) => entry.weeksHit >= WEEKLY_MIN_HITS)
    .sort((a, b) => a.weekday - b.weekday);
  if (usual.length === 0) return null;

  const matching = usual
    .flatMap((entry) => entry.list)
    .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
  const amounts = matching.map((expense) => expense.amount);
  const hitRate = usual.reduce((sum, entry) => sum + entry.weeksHit / weeks, 0) / usual.length;
  const confidence =
    0.5 * hitRate + 0.3 * amountStability(amounts) + 0.2 * Math.min(1, matching.length / 8);

  const lastDay = horizonEndOf(today);
  const payments: PredictedPayment[] = [];
  const range = paymentRange(amounts);
  for (let day = dayNumber(today); day <= dayNumber(lastDay); day++) {
    const date = fromDayNumber(day);
    const alreadyPaid = date === today && paidToday.has(group.key);
    if (usual.some((entry) => entry.weekday === isoWeekday(date)) && !alreadyPaid) {
      payments.push({ predictedOn: date, ...range });
    }
  }
  const names = usual.map((entry) => WEEKDAYS[entry.weekday - 1] ?? "");
  const weeksHit = Math.round(usual.reduce((sum, entry) => sum + entry.weeksHit, 0) / usual.length);
  return {
    ...baseOf({ ...group, expenses: matching }, "weekly", confidence, weeksHit, names),
    payments,
  };
}

/** Finds the payments the User is likely to make between `today` and the end of the month. */
export function detectCandidates(history: HistoryExpense[], today: string): RuleCandidate[] {
  const found: RuleCandidate[] = [];
  // Something already paid today is not expected again today.
  const paidToday = new Set(
    history.flatMap((expense) => {
      const key = expense.occurredOn === today ? merchantKey(expense.merchantName) : null;
      return key ? [key] : [];
    }),
  );
  for (const group of groupByMerchant(history, today)) {
    const weekly = weeklyCandidate(group, today, paidToday);
    const monthly = monthlyCandidate(group, today, paidToday);
    // A merchant that fits both is a habit when it shows up often, and a bill otherwise.
    const chosen = weekly && (!monthly || group.expenses.length >= 6) ? weekly : monthly;
    if (chosen && chosen.payments.length > 0) found.push(chosen);
  }
  return found.sort((a, b) => b.ruleConfidence - a.ruleConfidence || a.key.localeCompare(b.key));
}

/** What the model is asked to judge: the evidence for each candidate, never the User's identity. */
export function toModelCandidates(candidates: RuleCandidate[]): ForecastCandidate[] {
  return candidates.map((candidate) => ({
    key: candidate.key,
    merchantName: candidate.merchantName,
    pattern: candidate.pattern,
    ruleConfidence: candidate.ruleConfidence,
    amounts: candidate.amounts,
    dates: candidate.dates,
    predictedOn: candidate.payments.map((payment) => payment.predictedOn),
  }));
}

export interface ForecastDraft {
  items: ForecastItemDraft[];
  candidateCount: number;
  discardedCount: number;
}

/**
 * Applies the model's judgement, then keeps only the candidates at or above the threshold.
 * Without a judgement for a candidate, its rule confidence stands.
 */
export function selectItems(
  candidates: RuleCandidate[],
  judgements: ForecastJudgement[] | null,
  threshold: number = DEFAULT_FORECAST_THRESHOLD,
): ForecastDraft {
  const judged = new Map((judgements ?? []).map((judgement) => [judgement.key, judgement]));
  const items: ForecastItemDraft[] = [];
  let discarded = 0;
  for (const candidate of candidates) {
    const judgement = judged.get(candidate.key);
    const confidence = judgement
      ? round3(
          clamp(
            judgement.confidence,
            candidate.ruleConfidence - MAX_DROP,
            candidate.ruleConfidence + MAX_RISE,
          ),
        )
      : candidate.ruleConfidence;
    if (confidence < threshold) {
      discarded += 1;
      continue;
    }
    for (const payment of candidate.payments) {
      items.push({
        ...payment,
        merchantName: candidate.merchantName,
        categoryId: candidate.categoryId,
        pattern: candidate.pattern,
        confidence: clamp(confidence, 0, 1),
        reason: judgement?.reason ?? candidate.reason,
      });
    }
  }
  items.sort(
    (a, b) =>
      a.predictedOn.localeCompare(b.predictedOn) || a.merchantName.localeCompare(b.merchantName),
  );
  return { items, candidateCount: candidates.length, discardedCount: discarded };
}

export interface ForecastTotals {
  weekRemaining: number;
  monthRemaining: number;
  monthSpentSoFar: number;
  projectedMonthEnd: number;
}

/** Totals for the rest of the week and month. Only unrealized items from today on are counted. */
export function forecastTotals(
  items: { predictedOn: string; amount: number; realized: boolean }[],
  spentSoFar: number,
  today: string,
): ForecastTotals {
  const upcoming = items.filter((item) => item.predictedOn >= today && !item.realized);
  const monthRemaining = upcoming
    .filter((item) => item.predictedOn <= endOfMonth(today))
    .reduce((sum, item) => sum + item.amount, 0);
  const weekRemaining = upcoming
    .filter((item) => item.predictedOn <= endOfWeek(today))
    .reduce((sum, item) => sum + item.amount, 0);
  return {
    weekRemaining,
    monthRemaining,
    monthSpentSoFar: spentSoFar,
    projectedMonthEnd: spentSoFar + monthRemaining,
  };
}

export interface RealizedMatch {
  itemIndex: number;
  transactionId: string;
  actualAmount: number;
}

/** A prediction matches a payment from the same merchant within 3 days and 35% of the amount. */
const MATCH_DAYS = 3;
const MATCH_AMOUNT = 0.35;

/** Pairs predictions whose date has come with the confirmed payments that fulfilled them. */
export function matchRealized(
  items: { predictedOn: string; merchantName: string; amount: number }[],
  expenses: HistoryExpense[],
  today: string,
  /** Payments before this date are ignored: they happened before the forecast existed. */
  since?: string,
): RealizedMatch[] {
  const taken = new Set<string>();
  const matches: RealizedMatch[] = [];
  const order = items
    .map((_, index) => index)
    .sort((a, b) => (items[a]?.predictedOn ?? "").localeCompare(items[b]?.predictedOn ?? ""));
  for (const index of order) {
    const item = items[index];
    if (!item || item.predictedOn > today) continue;
    const key = merchantKey(item.merchantName);
    let best: { expense: HistoryExpense; distance: number } | null = null;
    for (const expense of expenses) {
      if (since && expense.occurredOn < since) continue;
      if (taken.has(expense.id) || merchantKey(expense.merchantName) !== key) continue;
      const days = Math.abs(dayNumber(expense.occurredOn) - dayNumber(item.predictedOn));
      const off = Math.abs(expense.amount - item.amount) / item.amount;
      if (days > MATCH_DAYS || off > MATCH_AMOUNT) continue;
      const distance = days + off;
      if (!best || distance < best.distance) best = { expense, distance };
    }
    if (best) {
      taken.add(best.expense.id);
      matches.push({
        itemIndex: index,
        transactionId: best.expense.id,
        actualAmount: best.expense.amount,
      });
    }
  }
  return matches;
}

/** Hit rate and amount error over predictions whose date has passed. */
export function forecastAccuracy(
  items: { predictedOn: string; amount: number }[],
  matches: RealizedMatch[],
  today: string,
): { due: number; realized: number; meanAbsoluteErrorPercent: number | null } {
  const dueIndexes = new Set(
    items.flatMap((item, index) => (item.predictedOn < today ? [index] : [])),
  );
  const hit = matches.filter((match) => dueIndexes.has(match.itemIndex));
  const errors = hit.map((match) => {
    const predicted = items[match.itemIndex]?.amount ?? 1;
    return (Math.abs(match.actualAmount - predicted) / predicted) * 100;
  });
  return {
    due: dueIndexes.size,
    realized: hit.length,
    meanAbsoluteErrorPercent:
      errors.length === 0
        ? null
        : round3(errors.reduce((sum, value) => sum + value, 0) / errors.length),
  };
}
