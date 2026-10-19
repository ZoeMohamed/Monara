import type { RecurringBillProposal, Transaction } from "@monara/contracts";

const INTERVAL_TOLERANCE = 0.2;

type Candidate = {
  merchantName: string;
  transactions: EligibleTransaction[];
};

type EligibleTransaction = Transaction & {
  merchantName: string;
  money: NonNullable<Transaction["money"]>;
  occurredOn: string;
};

function normalizeMerchant(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
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

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function medianAmount(transactions: EligibleTransaction[]): bigint {
  const amounts = transactions
    .map((transaction) => BigInt(transaction.money?.amountMinor ?? "0"))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return amounts[Math.floor(amounts.length / 2)] ?? 0n;
}

function amountIsSimilar(amount: bigint, expected: bigint): boolean {
  const difference = amount > expected ? amount - expected : expected - amount;
  return difference * 10n <= expected;
}

function inferInterval(days: number[]): { count: number; unit: "day" | "week" | "month" } | null {
  const typical = median(days);
  const options = [
    { unit: "month" as const, count: 30, minimum: 25, maximum: 35 },
    { unit: "week" as const, count: 7, minimum: 6, maximum: 8 },
    { unit: "day" as const, count: 1, minimum: 1, maximum: 3 },
  ];
  const option = options.find(
    (candidate) =>
      typical >= candidate.minimum &&
      typical <= candidate.maximum &&
      days.every((value) => Math.abs(value - typical) <= typical * INTERVAL_TOLERANCE),
  );
  return option
    ? { count: option.unit === "day" ? Math.round(typical) : 1, unit: option.unit }
    : null;
}

function candidateToProposal(candidate: Candidate): RecurringBillProposal | null {
  const transactions = candidate.transactions.sort((left, right) =>
    left.occurredOn.localeCompare(right.occurredOn),
  );
  if (transactions.length < 3) return null;

  const expectedAmount = medianAmount(transactions);
  if (
    !transactions.every((transaction) =>
      amountIsSimilar(BigInt(transaction.money.amountMinor), expectedAmount),
    )
  ) {
    return null;
  }

  const intervals = transactions.slice(1).map((transaction, index) => {
    const previous = transactions[index];
    return previous ? daysBetween(previous.occurredOn, transaction.occurredOn) : 0;
  });
  const cadence = inferInterval(intervals);
  if (!cadence) return null;

  const latest = transactions[transactions.length - 1];
  if (!latest) return null;
  const accountIds = new Set(transactions.map((transaction) => transaction.financialAccountId));
  const financialAccountId =
    accountIds.size === 1 ? (transactions[0]?.financialAccountId ?? null) : null;
  const confidence = Math.min(
    0.99,
    0.55 + transactions.length * 0.05 + (accountIds.size === 1 ? 0.1 : 0),
  );

  return {
    financialAccountId,
    merchantName: latest.merchantName,
    expectedAmount: { amountMinor: expectedAmount.toString(), currency: "IDR" },
    intervalCount: cadence.count,
    intervalUnit: cadence.unit,
    nextDueOn: addDays(latest.occurredOn, cadence.unit === "month" ? 30 : cadence.count),
    cancellationUrl: null,
    confidence,
  };
}

/** Detects conservative recurring-expense proposals. Nothing is persisted until confirmation. */
export function detectRecurringBillProposals(
  transactions: readonly Transaction[],
): RecurringBillProposal[] {
  const candidates = new Map<string, Candidate>();
  for (const transaction of transactions) {
    if (
      transaction.reviewStatus !== "confirmed" ||
      transaction.kind !== "expense" ||
      !transaction.merchantName ||
      !transaction.money ||
      !transaction.occurredOn
    ) {
      continue;
    }
    const key = normalizeMerchant(transaction.merchantName);
    const candidate = candidates.get(key) ?? {
      merchantName: transaction.merchantName,
      transactions: [],
    };
    candidate.transactions.push(transaction as EligibleTransaction);
    candidates.set(key, candidate);
  }
  return [...candidates.values()]
    .map(candidateToProposal)
    .filter((proposal): proposal is RecurringBillProposal => proposal !== null);
}
