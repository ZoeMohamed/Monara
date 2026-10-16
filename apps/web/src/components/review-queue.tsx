"use client";

import { Button, Card, Chip } from "@monara/ui";
import { useAmountDisplay } from "@/components/app-session-context";
import { BrandMark } from "@/components/brand-mark";
import { Icon } from "@/components/icon";
import { useMerchantLogo } from "@/components/use-brand-logo";
import { formatDay, reviewFlags, type Transaction, transactionErrors } from "@/data/demo-ledger";

const kindLabels = { expense: "Expense", income: "Income", exclusion: "Exclusion" } as const;

function ReviewItem({
  transaction,
  onEdit,
  onConfirm,
  onReject,
}: {
  transaction: Transaction;
  onEdit: (id: string) => void;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const { formatRupiah } = useAmountDisplay();
  const flags = reviewFlags(transaction);
  const canConfirm = Object.keys(transactionErrors(transaction)).length === 0;
  const logo = useMerchantLogo(transaction.merchant);
  const name = transaction.merchant ?? "transaction";
  const details = [
    transaction.kind ? kindLabels[transaction.kind] : "Type missing",
    transaction.date ? formatDay(transaction.date) : "Date missing",
    transaction.method ?? "Account not assigned",
  ].join(" · ");
  return (
    <Card className="block rounded-3xl border border-border bg-surface p-4 sm:p-5">
      <button
        aria-label={`Review details of ${name}`}
        className="flex w-full min-w-0 items-start gap-3 rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
        onClick={() => onEdit(transaction.id)}
        type="button"
      >
        {logo ? (
          <BrandMark brand={logo} />
        ) : (
          <span
            aria-hidden
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"
          >
            <Icon className="h-5 w-5" name={transaction.kind === "income" ? "income" : "mail"} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block break-words text-base font-bold">
            {transaction.merchant ?? "Merchant or source missing"}
          </span>
          <span className="mt-0.5 block text-xs text-muted">{details}</span>
        </span>
        <strong className="shrink-0 text-right text-base tabular-nums">
          {transaction.amount === null ? "Amount missing" : formatRupiah(transaction.amount)}
        </strong>
      </button>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Chip size="sm" variant="soft">
          {transaction.confidence === null
            ? "Confidence unavailable"
            : `${transaction.confidence}% AI confidence`}
        </Chip>
        {flags.map((flag) => (
          <Chip color="warning" key={flag} size="sm" variant="soft">
            {flag}
          </Chip>
        ))}
      </div>
      {!canConfirm && (
        <p className="mt-2 text-xs text-muted">Add the missing details before confirming.</p>
      )}
      <div className="mt-4 grid grid-cols-[1fr_auto_auto] gap-2">
        <Button
          aria-label={`Confirm ${name}`}
          className="min-h-11 rounded-full"
          isDisabled={!canConfirm}
          onPress={() => onConfirm(transaction.id)}
        >
          <Icon className="h-4 w-4" name="check" />
          Confirm
        </Button>
        <Button
          aria-label={`Edit ${name}`}
          className="min-h-11 rounded-full px-4"
          onPress={() => onEdit(transaction.id)}
          variant="secondary"
        >
          Edit
        </Button>
        <Button
          aria-label={`Exclude ${name}`}
          className="min-h-11 rounded-full px-4 text-danger"
          onPress={() => onReject(transaction.id)}
          variant="ghost"
        >
          Exclude
        </Button>
      </div>
    </Card>
  );
}

export function ReviewQueue({
  transactions,
  onEdit,
  onConfirm,
  onReject,
}: {
  transactions: Transaction[];
  onEdit: (id: string) => void;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const pending = transactions.filter((transaction) => transaction.status === "pending");
  return (
    <section aria-labelledby="review-queue-title" className="mt-5">
      <h2 className="sr-only" id="review-queue-title">
        To review
      </h2>
      <p className="text-sm leading-6 text-muted">
        {pending.length > 0
          ? `${pending.length} ${pending.length === 1 ? "import is" : "imports are"} waiting. Each one counts toward totals only after you confirm it.`
          : "Imports wait here until you confirm them."}
      </p>
      <div className="mt-4 space-y-3">
        {pending.map((transaction) => (
          <ReviewItem
            key={transaction.id}
            transaction={transaction}
            onEdit={onEdit}
            onConfirm={onConfirm}
            onReject={onReject}
          />
        ))}
        {pending.length === 0 && (
          <Card className="block rounded-3xl border border-dashed border-border bg-surface p-6 text-center">
            <h3 className="font-bold">You’re all caught up.</h3>
            <p role="status" className="mt-2 text-sm text-muted">
              No transactions are waiting for review.
            </p>
          </Card>
        )}
      </div>
    </section>
  );
}
