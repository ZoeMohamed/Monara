"use client";

import { Button } from "@monara/ui";

import { categoryColor } from "@/data/category-style";
import { formatDay, formatRupiah, type Transaction } from "@/data/demo-ledger";

function transactionRowModel(transaction: Transaction, showDate: boolean) {
  const date = showDate && transaction.date ? formatDay(transaction.date) : null;
  const metadata = [
    transaction.status === "pending" ? "Needs review" : null,
    date,
    transaction.time,
  ]
    .filter(Boolean)
    .join(" · ");
  const category =
    transaction.category ??
    (transaction.kind === "income"
      ? "Income"
      : transaction.kind === "transfer"
        ? "Transfer"
        : "Uncategorized");
  const sign = transaction.kind === "income" ? "+" : transaction.kind === "expense" ? "−" : "";

  return {
    merchant: transaction.merchant ?? "Merchant or source missing",
    category,
    account: transaction.method ?? "Account not assigned",
    amount:
      transaction.amount === null ? "Amount missing" : `${sign}${formatRupiah(transaction.amount)}`,
    amountColor: transaction.kind === "income" ? "text-success" : "text-foreground",
    tint:
      transaction.kind === "income"
        ? "var(--success)"
        : transaction.kind === "transfer"
          ? "var(--muted)"
          : categoryColor(category),
    metadata,
  };
}

export function TransactionRow({
  transaction,
  onClick,
  showDate = false,
}: {
  transaction: Transaction;
  onClick: () => void;
  showDate?: boolean;
}) {
  const model = transactionRowModel(transaction, showDate);
  return (
    <Button
      variant="ghost"
      className="group h-auto min-h-11 w-full justify-start gap-3 rounded-xl px-0 py-3 text-left whitespace-normal sm:px-2"
      onPress={onClick}
      type="button"
    >
      <span
        aria-hidden
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base"
        style={{ background: `color-mix(in srgb, ${model.tint} 8%, var(--surface))` }}
      >
        {transaction.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">
          {model.merchant}
        </span>
        <span className="mt-0.5 block truncate text-xs font-normal text-muted">
          {model.category} · {model.account}
        </span>
      </span>
      <span className="min-w-0 max-w-[47%] shrink-0 text-right">
        <span
          className={`block break-words text-sm font-semibold tabular-nums ${model.amountColor}`}
        >
          {model.amount}
        </span>
        {model.metadata ? (
          <span className="mt-0.5 block text-xs font-normal text-muted">{model.metadata}</span>
        ) : null}
      </span>
    </Button>
  );
}
