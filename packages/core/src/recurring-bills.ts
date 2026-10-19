import type {
  BillReviewCandidate,
  BillReviewJudgement,
  RecurringBillProposal,
  RecurringBillSuggestion,
  Transaction,
} from "@monara/contracts";

const INTERVAL_TOLERANCE = 0.2;
const MIN_PAYMENTS = 3;
/** Only the latest payments describe the bill as it is now. */
const MAX_PAYMENTS = 12;
/** A bill whose next payment is this many intervals overdue has probably stopped. */
const STALE_INTERVALS = 1.5;
/** The model may move the rules' confidence only within this band. */
const REVIEW_DOWN = 0.25;
const REVIEW_UP = 0.1;
/** Below this, a suggestion is not shown. */
const MIN_BILL_CONFIDENCE = 0.6;

type EligibleTransaction = Transaction & {
  merchantName: string;
  money: NonNullable<Transaction["money"]>;
  occurredOn: string;
};

/** A rules match, with the payments it rests on. */
export interface RecurringBillCandidate {
  key: string;
  proposal: RecurringBillProposal;
  payments: { occurredOn: string; amountMinor: string }[];
}

export function recurringBillKey(merchantName: string): string {
  return merchantName.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function daysBetween(first: string, second: string): number {
  const start = Date.parse(`${first}T00:00:00Z`);
  const end = Date.parse(`${second}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The same day next month, or the month's last day when it is shorter (31 Jan -> 28 Feb). */
function addMonth(value: string): string {
  const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function medianAmount(transactions: EligibleTransaction[]): bigint {
  const amounts = transactions
    .map((transaction) => BigInt(transaction.money.amountMinor))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return amounts[Math.floor(amounts.length / 2)] ?? 0n;
}

function amountIsSimilar(amount: bigint, expected: bigint): boolean {
  const difference = amount > expected ? amount - expected : expected - amount;
  return difference * 10n <= expected;
}

function inferInterval(days: number[]): "week" | "month" | null {
  const typical = median(days);
  const options = [
    { unit: "month" as const, minimum: 25, maximum: 35 },
    { unit: "week" as const, minimum: 6, maximum: 8 },
  ];
  return (
    options.find(
      (candidate) =>
        typical >= candidate.minimum &&
        typical <= candidate.maximum &&
        days.every((value) => Math.abs(value - typical) <= typical * INTERVAL_TOLERANCE),
    )?.unit ?? null
  );
}

/**
 * The newest run of payments close to the latest amount. Older payments at another price,
 * or a one-off purchase at a different amount, are left out instead of rejecting the bill.
 */
function latestRun(transactions: EligibleTransaction[]): EligibleTransaction[] {
  const newestFirst = [...transactions].sort((left, right) =>
    right.occurredOn.localeCompare(left.occurredOn),
  );
  const latest = newestFirst[0];
  if (!latest) return [];
  const anchor = BigInt(latest.money.amountMinor);
  const run = newestFirst.filter((transaction) =>
    amountIsSimilar(BigInt(transaction.money.amountMinor), anchor),
  );
  return run.slice(0, MAX_PAYMENTS).reverse();
}

function toCandidate(
  key: string,
  transactions: EligibleTransaction[],
  today: string,
): RecurringBillCandidate | null {
  const run = latestRun(transactions);
  if (run.length < MIN_PAYMENTS) return null;

  const expectedAmount = medianAmount(run);
  if (
    !run.every((transaction) =>
      amountIsSimilar(BigInt(transaction.money.amountMinor), expectedAmount),
    )
  ) {
    return null;
  }
  const intervals = run.slice(1).map((transaction, index) => {
    const previous = run[index];
    return previous ? daysBetween(previous.occurredOn, transaction.occurredOn) : 0;
  });
  const unit = inferInterval(intervals);
  if (!unit) return null;

  const latest = run[run.length - 1];
  if (!latest) return null;
  const typicalDays = unit === "month" ? 30 : 7;
  if (daysBetween(latest.occurredOn, today) > typicalDays * (1 + STALE_INTERVALS)) return null;

  // The next due date is the first one after today, so a bill paid last cycle still shows.
  let nextDueOn = unit === "month" ? addMonth(latest.occurredOn) : addDays(latest.occurredOn, 7);
  while (nextDueOn < today) {
    nextDueOn = unit === "month" ? addMonth(nextDueOn) : addDays(nextDueOn, 7);
  }

  const accountIds = new Set(run.map((transaction) => transaction.financialAccountId));
  const financialAccountId = accountIds.size === 1 ? (run[0]?.financialAccountId ?? null) : null;
  const confidence = Math.min(
    0.95,
    0.55 + Math.min(run.length, 6) * 0.05 + (accountIds.size === 1 ? 0.1 : 0),
  );

  return {
    key,
    proposal: {
      financialAccountId,
      merchantName: latest.merchantName.trim(),
      expectedAmount: { amountMinor: expectedAmount.toString(), currency: "IDR" },
      intervalCount: 1,
      intervalUnit: unit,
      nextDueOn,
      cancellationUrl: null,
      confidence: Math.round(confidence * 1000) / 1000,
    },
    payments: run.map((transaction) => ({
      occurredOn: transaction.occurredOn,
      amountMinor: transaction.money.amountMinor,
    })),
  };
}

/**
 * Finds weekly or monthly bills in confirmed expenses: the same merchant, a similar amount,
 * and a regular interval, still being paid as of `today`. Nothing is stored; the User
 * confirms or dismisses each suggestion.
 */
export function detectRecurringBillCandidates(
  transactions: readonly Transaction[],
  today: string,
): RecurringBillCandidate[] {
  const groups = new Map<string, EligibleTransaction[]>();
  for (const transaction of transactions) {
    if (
      transaction.deletedAt ||
      transaction.reviewStatus !== "confirmed" ||
      transaction.kind !== "expense" ||
      !transaction.merchantName?.trim() ||
      !transaction.money ||
      !transaction.occurredOn ||
      transaction.occurredOn > today
    ) {
      continue;
    }
    const key = recurringBillKey(transaction.merchantName);
    const group = groups.get(key) ?? [];
    group.push(transaction as EligibleTransaction);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, group]) => toCandidate(key, group, today))
    .filter((candidate): candidate is RecurringBillCandidate => candidate !== null);
}

export function toBillReviewCandidate(candidate: RecurringBillCandidate): BillReviewCandidate {
  return {
    key: candidate.key,
    merchantName: candidate.proposal.merchantName,
    intervalUnit: candidate.proposal.intervalUnit === "week" ? "week" : "month",
    payments: candidate.payments,
  };
}

/**
 * Applies the AI check. The model can only reject a candidate or move its confidence within
 * a small band; it never adds a bill or changes an amount or date. Without judgements the
 * rules stand alone.
 */
export function applyBillReview(
  candidates: RecurringBillCandidate[],
  judgements: BillReviewJudgement[] | null,
): RecurringBillSuggestion[] {
  const byKey = new Map((judgements ?? []).map((judgement) => [judgement.key, judgement]));
  const suggestions: RecurringBillSuggestion[] = [];
  for (const candidate of candidates) {
    const rules = candidate.proposal.confidence ?? MIN_BILL_CONFIDENCE;
    const judgement = byKey.get(candidate.key);
    if (judgement && !judgement.isBill) continue;
    const confidence = judgement
      ? Math.min(rules + REVIEW_UP, Math.max(rules - REVIEW_DOWN, judgement.confidence))
      : rules;
    if (confidence < MIN_BILL_CONFIDENCE) continue;
    suggestions.push({
      proposal: { ...candidate.proposal, confidence: Math.round(confidence * 1000) / 1000 },
      paymentCount: candidate.payments.length,
      lastPaidOn: candidate.payments[candidate.payments.length - 1]?.occurredOn ?? "",
      reason: judgement?.reason ?? null,
    });
  }
  return suggestions.sort((left, right) =>
    left.proposal.nextDueOn.localeCompare(right.proposal.nextDueOn),
  );
}
