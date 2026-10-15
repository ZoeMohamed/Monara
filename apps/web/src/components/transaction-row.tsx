"use client";

import { Button } from "@monara/ui";
import { useAmountDisplay } from "@/components/app-session-context";

import { BrandMark } from "@/components/brand-mark";
import { Icon, type IconName } from "@/components/icon";
import styles from "@/components/transaction-row.module.css";
import { useMerchantLogo } from "@/components/use-brand-logo";
import { chosenCategoryIcon } from "@/data/category-icons";
import { categoryColor } from "@/data/category-style";
import { formatDay, type Transaction } from "@/data/demo-ledger";

function transactionRowModel(
  transaction: Transaction,
  showDate: boolean,
  formatRupiah: ReturnType<typeof useAmountDisplay>["formatRupiah"],
) {
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
  const icon: IconName =
    transaction.kind === "income"
      ? "income"
      : transaction.kind === "transfer"
        ? "transfer"
        : chosenCategoryIcon(category, transaction.categoryIcon);

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
    icon,
    metadata,
  };
}

export function TransactionRow({
  transaction,
  onClick,
  showDate = false,
}: {
  transaction: Transaction;
  onClick?: () => void;
  showDate?: boolean;
}) {
  const { formatRupiah } = useAmountDisplay();
  const model = transactionRowModel(transaction, showDate, formatRupiah);
  const brand = useMerchantLogo(transaction.merchant);
  const content = (
    <>
      {brand ? (
        <BrandMark brand={brand} />
      ) : (
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base"
          style={{
            background: `color-mix(in srgb, ${model.tint} 10%, var(--surface))`,
            color: model.tint,
          }}
        >
          <Icon name={model.icon} />
        </span>
      )}
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
  return onClick ? (
    <Button className={styles.row} onPress={onClick} type="button" variant="ghost">
      {content}
    </Button>
  ) : (
    <div className={styles.row}>{content}</div>
  );
}
