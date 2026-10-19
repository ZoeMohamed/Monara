"use client";

import { Button } from "@monara/ui";
import { AccountBadge } from "@/components/account-badge";
import { useAmountDisplay, useTransactionAccount } from "@/components/app-session-context";
import { Icon } from "@/components/icon";
import styles from "@/components/transaction-row.module.css";
import { formatDay, type Transaction } from "@/data/demo-ledger";

function transactionRowModel(
  transaction: Transaction,
  showDate: boolean,
  formatRupiah: ReturnType<typeof useAmountDisplay>["formatRupiah"],
) {
  const date = showDate && transaction.date ? formatDay(transaction.date) : null;
  const metadata = [transaction.kind === "exclusion" ? "Excluded" : null, date, transaction.time]
    .filter(Boolean)
    .join(" · ");
  const category =
    transaction.category ?? (transaction.kind === "income" ? "Income" : "Uncategorized");
  const sign = transaction.kind === "income" ? "+" : transaction.kind === "expense" ? "−" : "";

  return {
    merchant: transaction.merchant ?? "Merchant or source missing",
    category,
    account: transaction.method ?? "Account not assigned",
    amount:
      transaction.amount === null ? "Amount missing" : `${sign}${formatRupiah(transaction.amount)}`,
    amountColor:
      transaction.kind === "exclusion"
        ? "text-muted"
        : transaction.kind === "income"
          ? "text-success"
          : "text-foreground",
    metadata,
  };
}

/** The leading mark is the Financial Account the money moved through, not the merchant. */
export function TransactionRow({
  transaction,
  onClick,
  onConfirm,
  showDate = false,
}: {
  transaction: Transaction;
  onClick?: () => void;
  /** Adds a one-tap confirm beside a pending row, so a clean import needs no detour. */
  onConfirm?: () => void;
  showDate?: boolean;
}) {
  const { formatRupiah } = useAmountDisplay();
  const account = useTransactionAccount(transaction);
  const model = transactionRowModel(transaction, showDate, formatRupiah);
  const content = (
    <>
      <AccountBadge account={account} name={transaction.method} size={36} />
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
          className={`block text-sm font-semibold tabular-nums [overflow-wrap:anywhere] ${model.amountColor}`}
        >
          {model.amount}
        </span>
        {model.metadata ? (
          <span className="mt-0.5 block text-xs font-normal text-muted">{model.metadata}</span>
        ) : null}
      </span>
    </>
  );
  const status = transaction.status;
  const row = onClick ? (
    <Button
      className={styles.row}
      data-kind={transaction.kind ?? "unknown"}
      data-status={status}
      onPress={onClick}
      aria-label={transaction.status === "pending" ? `${model.merchant}, to review` : undefined}
      type="button"
      variant="ghost"
    >
      {content}
    </Button>
  ) : (
    <div className={styles.row} data-kind={transaction.kind ?? "unknown"} data-status={status}>
      {content}
    </div>
  );
  if (!onConfirm) return row;
  return (
    <div className={styles.item} data-status={status}>
      {row}
      <Button
        aria-label={`Confirm ${model.merchant}`}
        className={styles.confirm}
        isIconOnly
        onPress={onConfirm}
        variant="ghost"
      >
        <Icon className="h-5 w-5" name="check" strokeWidth={2.6} />
      </Button>
    </div>
  );
}
