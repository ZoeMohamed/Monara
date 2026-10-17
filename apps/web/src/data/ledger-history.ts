import type { LedgerKind } from "./app-navigation.ts";
import { isCalendarDate, newestFirst, type Transaction, transactionErrors } from "./demo-ledger.ts";

// Undated imports stay visible until the actual date can be supplied.
export function historyForMonth(transactions: Transaction[], month: string): Transaction[] {
  return transactions.filter(
    (item) => !isCalendarDate(item.date) || item.date?.startsWith(`${month}-`),
  );
}

export function filterHistory(
  transactions: Transaction[],
  query: string,
  kind: LedgerKind,
  reviewOnly: boolean,
): Transaction[] {
  const search = query.trim().toLowerCase();
  return transactions
    .filter(
      (item) =>
        (!reviewOnly || item.status === "pending") &&
        (kind === "all" || item.kind === kind) &&
        `${item.merchant ?? ""} ${item.category ?? ""} ${item.method ?? ""}`
          .toLowerCase()
          .includes(search),
    )
    .sort(newestFirst);
}

export function groupHistory(transactions: Transaction[]) {
  const groups = new Map<string, { transactions: Transaction[]; spending: bigint }>();
  for (const transaction of transactions) {
    const date = isCalendarDate(transaction.date) ? (transaction.date ?? "undated") : "undated";
    const group = groups.get(date) ?? { transactions: [], spending: BigInt(0) };
    group.transactions.push(transaction);
    if (
      transaction.status === "confirmed" &&
      transaction.kind === "expense" &&
      Object.keys(transactionErrors(transaction)).length === 0
    ) {
      group.spending += BigInt(transaction.amount ?? 0);
    }
    groups.set(date, group);
  }
  return [...groups].sort(([first], [second]) => {
    if (first === "undated") return 1;
    if (second === "undated") return -1;
    return second.localeCompare(first);
  });
}
