"use client";

import { Button, Chip } from "@monara/ui";
import { useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { ModalDialog } from "@/components/modal-dialog";
import {
  formatRupiah,
  isCalendarDate,
  type Transaction,
  transactionErrors,
} from "@/data/demo-ledger";

const typeLabels = { expense: "Expense", income: "Income", transfer: "Transfer" } as const;
const statusLabels = { pending: "Needs review", confirmed: "Confirmed", rejected: "Rejected" };
const statusColors = { pending: "warning", confirmed: "success", rejected: "default" } as const;
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function detailsOf(transaction: Transaction) {
  const pending = transaction.status === "pending";
  const editable = pending || transaction.status === "confirmed";
  const valid = Object.keys(transactionErrors(transaction)).length === 0;
  const confidence = transaction.confidence;
  const rows = [
    ["Type", transaction.kind ? typeLabels[transaction.kind] : "Not selected"],
    [
      "Date",
      isCalendarDate(transaction.date)
        ? dateFormatter.format(new Date(`${transaction.date}T00:00:00Z`))
        : "Not provided",
    ],
    ["Time", transaction.time || "Not provided"],
    [transaction.kind === "transfer" ? "From → To" : "Account", transaction.method || "Unassigned"],
    ["Category", transaction.category || "Unassigned"],
    ["Currency", transaction.currency || "Not provided"],
  ];
  // A known extraction score identifies imported sample data. No source evidence is fabricated.
  if (confidence !== null && Number.isFinite(confidence) && confidence >= 0 && confidence <= 100) {
    rows.push(["Import confidence", `${confidence}%`]);
  }
  return {
    pending,
    editable,
    valid,
    rows,
    merchant: transaction.merchant || "Transaction",
    amount: transaction.amount === null ? "Amount missing" : formatRupiah(transaction.amount),
    help: valid
      ? "Not included in totals until confirmed."
      : "Complete the missing fields to confirm.",
  };
}

function DeleteConfirmation({
  transaction,
  deleting,
  failed,
  onCancel,
  onDelete,
}: {
  transaction: Transaction;
  deleting: boolean;
  failed: boolean;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const effect =
    transaction.kind === "expense"
      ? "This expense will leave your spending and budgets."
      : transaction.kind === "income"
        ? "This income will leave your income totals."
        : "This transfer will leave your ledger. Income and spending stay the same.";
  return (
    <div className="p-5 sm:p-6">
      <h2 id="transaction-details-title" className="text-xl font-bold">
        Delete transaction?
      </h2>
      <p className="mt-4 break-words text-lg font-bold">
        {transaction.merchant || "Transaction"} · {formatRupiah(transaction.amount ?? 0)}
      </p>
      <p className="mt-2 text-sm text-muted">{effect} You can undo after deleting.</p>
      <p className="mt-2 text-xs text-muted">Sample data · This session only</p>
      {failed ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          Not deleted. Try again.
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button
          autoFocus
          className="min-h-11"
          isDisabled={deleting}
          onPress={onCancel}
          variant="secondary"
        >
          Keep transaction
        </Button>
        <Button className="min-h-11" isDisabled={deleting} onPress={onDelete} variant="danger">
          {deleting ? "Deleting…" : "Delete transaction"}
        </Button>
      </div>
    </div>
  );
}

export function TransactionDetails({
  transaction,
  onClose,
  onEdit,
  onConfirm,
  onDelete,
}: {
  transaction: Transaction;
  onClose: () => void;
  onEdit: () => void;
  onConfirm: () => void;
  onDelete?: () => void | Promise<void>;
}) {
  const details = detailsOf(transaction);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const deleteInFlight = useRef(false);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const cancelDelete = () => {
    if (deleteInFlight.current) return;
    setConfirmingDelete(false);
    setDeleteFailed(false);
    requestAnimationFrame(() => deleteButton.current?.focus());
  };
  const close = () => {
    if (deleteInFlight.current) return;
    if (confirmingDelete) cancelDelete();
    else onClose();
  };
  const remove = async () => {
    if (!onDelete || deleteInFlight.current) return;
    deleteInFlight.current = true;
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await onDelete();
      // Successful callbacks close the details; keep submission blocked until unmount.
    } catch {
      deleteInFlight.current = false;
      setDeleting(false);
      setDeleteFailed(true);
    }
  };

  if (confirmingDelete) {
    return (
      <ModalDialog labelledBy="transaction-details-title" onClose={close}>
        <DeleteConfirmation
          deleting={deleting}
          failed={deleteFailed}
          onCancel={cancelDelete}
          onDelete={remove}
          transaction={transaction}
        />
      </ModalDialog>
    );
  }

  return (
    <ModalDialog labelledBy="transaction-details-title" onClose={close}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="transaction-details-title" className="break-words text-xl font-bold">
              {details.merchant}
            </h2>
            <p className="mt-1 text-sm text-muted">Sample data · This session only</p>
          </div>
          <Button isIconOnly variant="ghost" aria-label="Close transaction details" onPress={close}>
            <Icon name="close" />
          </Button>
        </div>
        <p className="mt-6 break-words text-3xl font-bold tabular-nums">{details.amount}</p>
        <Chip className="mt-3" color={statusColors[transaction.status]} variant="soft">
          {statusLabels[transaction.status]}
        </Chip>
        <dl className="mt-6 divide-y divide-border border-y border-border">
          {details.rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-5 py-3 text-sm">
              <dt className="shrink-0 text-muted">{label}</dt>
              <dd className="min-w-0 break-words text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {details.pending && (
          <p id="transaction-review-help" className="mt-4 text-sm text-muted">
            {details.help}
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          {onDelete && transaction.status === "confirmed" && details.valid ? (
            <Button
              className="mr-auto min-h-11 text-danger"
              onPress={() => setConfirmingDelete(true)}
              ref={deleteButton}
              variant="ghost"
            >
              Delete
            </Button>
          ) : null}
          <Button className="min-h-11" variant="secondary" onPress={onClose}>
            Close
          </Button>
          {details.editable && (
            <Button
              className="min-h-11"
              variant={details.pending ? "secondary" : "primary"}
              onPress={onEdit}
            >
              Edit
            </Button>
          )}
          {details.pending && (
            <Button
              className="min-h-11"
              isDisabled={!details.valid}
              aria-describedby="transaction-review-help"
              onPress={onConfirm}
            >
              Confirm
            </Button>
          )}
        </div>
      </div>
    </ModalDialog>
  );
}
