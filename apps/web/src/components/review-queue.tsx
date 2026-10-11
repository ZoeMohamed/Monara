"use client";

import { Button, Card, Chip } from "@monara/ui";
import { reviewFlags, type Transaction, transactionErrors } from "@/data/demo-ledger";
import { formatRupiah } from "@/data/sample-data";

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
  const flags = reviewFlags(transaction);
  const canConfirm = Object.keys(transactionErrors(transaction)).length === 0;
  return (
    <Card className="block rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-base font-bold">
            {transaction.merchant ?? "Merchant or source missing"}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {transaction.kind ?? "Type missing"} · {transaction.date ?? "Date missing"} ·{" "}
            {transaction.method ?? "Account not assigned"}
          </p>
        </div>
        <p className="font-bold">
          {transaction.amount === null ? "Amount missing" : formatRupiah(transaction.amount)}
        </p>
      </div>
      <p className="mt-3 text-xs text-muted">
        {transaction.confidence === null
          ? "Confidence unavailable"
          : `${transaction.confidence}% AI confidence`}{" "}
        · Pending review
      </p>
      {flags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {flags.map((flag) => (
            <Chip key={flag} color="warning" variant="soft" size="sm">
              {flag}
            </Chip>
          ))}
        </div>
      )}
      {!canConfirm && (
        <p className="mt-3 text-sm text-muted">
          Add the missing required details before confirming.
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          className="min-h-11"
          aria-label={`Confirm ${transaction.merchant ?? "transaction"}`}
          isDisabled={!canConfirm}
          onPress={() => onConfirm(transaction.id)}
        >
          Confirm
        </Button>
        <Button
          variant="secondary"
          className="min-h-11"
          aria-label={`Edit ${transaction.merchant ?? "transaction"}`}
          onPress={() => onEdit(transaction.id)}
        >
          Edit
        </Button>
        <Button
          variant="ghost"
          className="min-h-11 text-danger"
          aria-label={`Reject ${transaction.merchant ?? "transaction"}`}
          onPress={() => onReject(transaction.id)}
        >
          Reject
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
    <section aria-labelledby="review-queue-title" className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="review-queue-title" className="text-xl font-bold">
          Review Queue
        </h2>
        <Chip variant="soft">{pending.length} pending</Chip>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted">
        Every import needs your review, whatever its confidence. Pending items stay out of totals.
        Changes to this demo last until you leave or reload.
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
          <Card className="block rounded-2xl border border-dashed border-border bg-surface p-6 text-center">
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
