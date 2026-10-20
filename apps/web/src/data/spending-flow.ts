import { demoSummary, isCalendarDate, type Transaction } from "./demo-ledger";
import { reportingAmountFor } from "./demo-ledger.ts";

type MerchantSpending = {
  name: string;
  amount: bigint;
  transactions: Transaction[];
};

type CategorySpending = {
  name: string;
  categoryId?: string;
  amount: bigint;
  count: number;
  merchants: MerchantSpending[];
};

function compareSpending(
  left: { name: string; amount: bigint },
  right: { name: string; amount: bigint },
): number {
  return left.amount === right.amount
    ? left.name.localeCompare(right.name, "en-US")
    : left.amount > right.amount
      ? -1
      : 1;
}

function periodRecords(transactions: Transaction[], period: string) {
  if (/^\d{4}$/.test(period) && isCalendarDate(`${period}-01-01`)) {
    return Array.from(
      { length: 12 },
      (_, index) =>
        demoSummary(transactions, `${period}-${String(index + 1).padStart(2, "0")}`).confirmed,
    ).flat();
  }
  if (!/^\d{4}-\d{2}$/.test(period) || !isCalendarDate(`${period}-01`)) {
    throw new Error("Choose a valid calendar month or year.");
  }
  return demoSummary(transactions, period).confirmed;
}

// Presentation-only flow: each recorded expense is counted once at every level.
export function spendingFlow(transactions: Transaction[], period: string) {
  const records = periodRecords(transactions, period);
  let spending = BigInt(0);
  const categories = new Map<
    string,
    { name: string; categoryId?: string; amount: bigint; merchants: Map<string, MerchantSpending> }
  >();
  for (const transaction of records) {
    if (transaction.kind !== "expense") continue;
    const categoryName = transaction.category || "Uncategorized";
    const key = transaction.categoryId ? `id:${transaction.categoryId}` : `name:${categoryName}`;
    const merchantName = transaction.merchant || "Unassigned merchant";
    const category = categories.get(key) ?? {
      name: categoryName,
      ...(transaction.categoryId ? { categoryId: transaction.categoryId } : {}),
      amount: BigInt(0),
      merchants: new Map<string, MerchantSpending>(),
    };
    const merchant = category.merchants.get(merchantName) ?? {
      name: merchantName,
      amount: BigInt(0),
      transactions: [],
    };
    const amount = BigInt(reportingAmountFor(transaction) ?? 0);
    spending += amount;
    category.amount += amount;
    merchant.amount += amount;
    merchant.transactions.push(transaction);
    category.merchants.set(merchantName, merchant);
    categories.set(key, category);
  }
  const grouped: CategorySpending[] = Array.from(categories.values(), (category) => ({
    name: category.name,
    ...(category.categoryId ? { categoryId: category.categoryId } : {}),
    amount: category.amount,
    count: Array.from(category.merchants.values()).reduce(
      (count, merchant) => count + merchant.transactions.length,
      0,
    ),
    merchants: Array.from(category.merchants.values()).sort(compareSpending),
  }));
  return { spending, categories: grouped.sort(compareSpending) };
}

// A place can have expenses in more than one category. The ranked list combines them.
export function spendingPlaces(transactions: Transaction[], period: string): MerchantSpending[] {
  const places = new Map<string, MerchantSpending>();
  for (const category of spendingFlow(transactions, period).categories) {
    for (const merchant of category.merchants) {
      const place = places.get(merchant.name) ?? {
        name: merchant.name,
        amount: BigInt(0),
        transactions: [],
      };
      place.amount += merchant.amount;
      place.transactions.push(...merchant.transactions);
      places.set(merchant.name, place);
    }
  }
  return Array.from(places.values()).sort(compareSpending);
}

// Ranking a single payment never combines repeated titles or changes canonical records.
export function biggestExpenses(transactions: Transaction[], period: string): Transaction[] {
  return periodRecords(transactions, period)
    .filter((transaction) => transaction.kind === "expense")
    .sort((left, right) => {
      const leftAmount = BigInt(reportingAmountFor(left) ?? 0);
      const rightAmount = BigInt(reportingAmountFor(right) ?? 0);
      if (leftAmount !== rightAmount) return leftAmount > rightAmount ? -1 : 1;
      return (
        `${right.date} ${right.time ?? ""}`.localeCompare(`${left.date} ${left.time ?? ""}`) ||
        left.id.localeCompare(right.id, "en-US")
      );
    });
}
