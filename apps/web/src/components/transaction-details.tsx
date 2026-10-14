"use client";

import { Button, Chip } from "@monara/ui";
import { type RefObject, useRef, useState } from "react";
import { FinanceRecovery } from "@/components/budget-manager";
import { Icon } from "@/components/icon";
import { ModalDialog } from "@/components/modal-dialog";
import {
  formatRupiah,
  isCalendarDate,
  type Transaction,
  transactionErrors,
} from "@/data/demo-ledger";
import { FinanceClientError } from "@/lib/finance/client";

const typeLabels = { expense: "Expense", income: "Income", transfer: "Transfer" } as const;
const statusLabels = { pending: "Needs review", confirmed: "Confirmed", rejected: "Rejected" };
const statusColors = { pending: "warning", confirmed: "success", rejected: "default" } as const;
const sourceLabels = {
  manual_form: "Manual entry",
  gmail_email: "Gmail import",
  in_app_chat: "In-app Agent",
  whatsapp_text: "WhatsApp message",
  whatsapp_receipt: "WhatsApp receipt",
  whatsapp_voice: "WhatsApp voice",
} as const;
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const confidenceFormatter = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

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
  if (transaction.backend) rows.push(["Source", sourceLabels[transaction.backend.source]]);
  if (confidence !== null && Number.isFinite(confidence) && confidence >= 0 && confidence <= 100) {
    rows.push(["Import confidence", `${confidenceFormatter.format(confidence)}%`]);
  }
  return {
    pending,
    editable,
    valid,
    rows,
    merchant: transaction.merchant || "Transaction",
    amount:
      transaction.amount === null
        ? "Amount missing"
        : transaction.currency === "IDR"
          ? formatRupiah(transaction.amount)
          : "Currency missing",
    help: valid
      ? "Not included in totals until confirmed."
      : "Complete the missing fields to confirm.",
  };
}

function DeleteConfirmation({
  transaction,
  deleting,
  error,
  onCancel,
  onDelete,
  refreshRequired,
  onRefreshRecords,
}: {
  transaction: Transaction;
  deleting: boolean;
  error: string | null;
  onCancel: () => void;
  onDelete: () => void;
  refreshRequired?: boolean;
  onRefreshRecords?: () => Promise<void>;
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
        {transaction.merchant || "Transaction"} · {detailsOf(transaction).amount}
      </p>
      <p className="mt-2 text-sm text-muted">
        {effect}{" "}
        {transaction.backend
          ? "Undo is unavailable for saved records."
          : "You can undo after deleting."}
      </p>
      {transaction.backend ? <p className="mt-2 text-xs text-muted">Your private ledger</p> : null}
      {error ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {refreshRequired && (
        <FinanceRecovery
          message="Refresh your records to check the deletion result."
          onRefreshRecords={onRefreshRecords}
        />
      )}
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
        <Button
          className="min-h-11"
          isDisabled={deleting || Boolean(refreshRequired)}
          onPress={onDelete}
          variant="danger"
        >
          {deleting ? "Deleting…" : "Delete transaction"}
        </Button>
      </div>
    </div>
  );
}

type TransactionDetailsProps = {
  transaction: Transaction;
  onClose: () => void;
  onEdit: () => void;
  onConfirm: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  pending?: boolean;
  confirmationError?: string | null;
  refreshRequired?: boolean;
  onRefreshRecords?: () => Promise<void>;
};

function useTransactionDeletion({
  onClose,
  onDelete,
  pending = false,
  refreshRequired = false,
}: Pick<TransactionDetailsProps, "onClose" | "onDelete" | "pending" | "refreshRequired">) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteInFlight = useRef(false);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const cancelDelete = () => {
    if (deleteInFlight.current || pending) return;
    setConfirmingDelete(false);
    setDeleteError(null);
    requestAnimationFrame(() => deleteButton.current?.focus());
  };
  const close = () => {
    if (deleteInFlight.current || pending) return;
    if (confirmingDelete) cancelDelete();
    else onClose();
  };
  const remove = async () => {
    if (!onDelete || deleteInFlight.current || refreshRequired) return;
    deleteInFlight.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete();
      // Successful callbacks close the details; keep submission blocked until unmount.
    } catch (error) {
      deleteInFlight.current = false;
      setDeleting(false);
      setDeleteError(
        error instanceof FinanceClientError
          ? error.message
          : "The deletion could not be verified. Refresh your records and try again.",
      );
    }
  };
  return {
    confirmingDelete,
    deleting,
    deleteError,
    deleteButton,
    cancelDelete,
    close,
    remove,
    openDelete: () => setConfirmingDelete(true),
  };
}

function TransactionInformation({
  transaction,
  details,
  pending,
  onClose,
}: {
  transaction: Transaction;
  details: ReturnType<typeof detailsOf>;
  pending: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="transaction-details-title" className="break-words text-xl font-bold">
            {details.merchant}
          </h2>
          {transaction.backend ? (
            <p className="mt-1 text-sm text-muted">Your private ledger</p>
          ) : null}
        </div>
        <Button
          isIconOnly
          variant="ghost"
          aria-label="Close transaction details"
          isDisabled={pending}
          onPress={onClose}
        >
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
    </>
  );
}

function TransactionActions({
  props,
  details,
  deletion,
  deleteButton,
}: {
  props: TransactionDetailsProps;
  details: ReturnType<typeof detailsOf>;
  deletion: Pick<ReturnType<typeof useTransactionDeletion>, "openDelete">;
  deleteButton: RefObject<HTMLButtonElement | null>;
}) {
  const { transaction, onClose, onEdit, onConfirm, onDelete, confirmationError, onRefreshRecords } =
    props;
  const pending = Boolean(props.pending);
  const refreshRequired = Boolean(props.refreshRequired);
  const locked = pending || refreshRequired;
  return (
    <>
      {confirmationError ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {confirmationError}
        </p>
      ) : null}
      {refreshRequired && (
        <FinanceRecovery
          message="Refresh your records to check the confirmation result."
          onRefreshRecords={onRefreshRecords}
        />
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        {onDelete && transaction.status === "confirmed" && details.valid ? (
          <Button
            className="mr-auto min-h-11 text-danger"
            onPress={deletion.openDelete}
            ref={deleteButton}
            variant="ghost"
            isDisabled={locked}
          >
            Delete
          </Button>
        ) : null}
        <Button className="min-h-11" variant="secondary" onPress={onClose} isDisabled={pending}>
          Close
        </Button>
        {details.editable && (
          <Button
            className="min-h-11"
            variant={details.pending ? "secondary" : "primary"}
            onPress={onEdit}
            isDisabled={locked}
          >
            Edit
          </Button>
        )}
        {details.pending && (
          <Button
            className="min-h-11"
            isDisabled={!details.valid || locked}
            aria-describedby="transaction-review-help"
            onPress={onConfirm}
          >
            {pending ? "Confirming…" : "Confirm"}
          </Button>
        )}
      </div>
    </>
  );
}

export function TransactionDetails(props: TransactionDetailsProps) {
  const details = detailsOf(props.transaction);
  const deletion = useTransactionDeletion(props);
  return (
    <ModalDialog labelledBy="transaction-details-title" onClose={deletion.close}>
      {deletion.confirmingDelete ? (
        <DeleteConfirmation
          deleting={deletion.deleting}
          error={deletion.deleteError}
          onCancel={deletion.cancelDelete}
          onDelete={deletion.remove}
          transaction={props.transaction}
          refreshRequired={props.refreshRequired}
          onRefreshRecords={props.onRefreshRecords}
        />
      ) : (
        <div className="p-5 sm:p-6">
          <TransactionInformation
            details={details}
            onClose={deletion.close}
            pending={Boolean(props.pending)}
            transaction={props.transaction}
          />
          <TransactionActions
            deletion={{ openDelete: deletion.openDelete }}
            deleteButton={deletion.deleteButton}
            details={details}
            props={props}
          />
        </div>
      )}
    </ModalDialog>
  );
}
