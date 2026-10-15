"use client";

import type { FinancialAccount, TransactionSource } from "@monara/contracts";
import { Button, Chip } from "@monara/ui";
import { type CSSProperties, type ReactNode, type RefObject, useRef, useState } from "react";
import { AccountBadge } from "@/components/account-badge";
import { BrandMark } from "@/components/brand-mark";
import { FinanceRecovery } from "@/components/budget-manager";
import { Icon, type IconName } from "@/components/icon";
import { ModalDialog } from "@/components/modal-dialog";
import styles from "@/components/transaction-details.module.css";
import { merchantBrand } from "@/data/brand-identity";
import { categoryColor, categoryIcon } from "@/data/category-style";
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
const sources: Record<TransactionSource, { icon: IconName; label: string }> = {
  manual_form: { icon: "compose", label: "Added by you" },
  gmail_email: { icon: "mail", label: "Imported from Gmail" },
  in_app_chat: { icon: "chat", label: "Added through Monara chat" },
  whatsapp_text: { icon: "whatsapp", label: "From a WhatsApp message" },
  whatsapp_receipt: { icon: "whatsapp", label: "From a WhatsApp receipt" },
  whatsapp_voice: { icon: "whatsapp", label: "From a WhatsApp voice note" },
};
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const confidenceFormatter = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

function validConfidence(confidence: number | null) {
  return confidence !== null && Number.isFinite(confidence) && confidence >= 0 && confidence <= 100;
}

// Live records state their source; demo imports are the ones carrying extraction confidence.
function sourceOf(transaction: Transaction) {
  const kind =
    transaction.backend?.source ??
    (transaction.confidence === null ? "manual_form" : "gmail_email");
  return { ...sources[kind], kind };
}

function detailsOf(transaction: Transaction) {
  const pending = transaction.status === "pending";
  const editable = pending || transaction.status === "confirmed";
  const valid = Object.keys(transactionErrors(transaction)).length === 0;
  const date = isCalendarDate(transaction.date)
    ? dateFormatter.format(new Date(`${transaction.date}T00:00:00Z`))
    : "Date not provided";
  const sign = transaction.kind === "income" ? "+" : transaction.kind === "expense" ? "−" : "";
  return {
    pending,
    editable,
    valid,
    // Secondary facts stay one tap away under “More details”.
    rows: [
      ["Type", transaction.kind ? typeLabels[transaction.kind] : "Not selected"],
      ["Currency", transaction.currency || "Not provided"],
      ["Status", statusLabels[transaction.status]],
      ...(validConfidence(transaction.confidence) && sourceOf(transaction).kind !== "manual_form"
        ? [["Extraction confidence", `${confidenceFormatter.format(transaction.confidence ?? 0)}%`]]
        : []),
    ],
    merchant: transaction.merchant || "Transaction",
    when: transaction.time ? `${date} · ${transaction.time}` : date,
    amount:
      transaction.amount === null
        ? "Amount missing"
        : !Number.isSafeInteger(transaction.amount) || transaction.amount <= 0
          ? "Amount invalid"
          : transaction.currency === "IDR"
            ? `${sign}${formatRupiah(transaction.amount)}`
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
  financialAccounts?: FinancialAccount[];
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

function Stop({
  label,
  visual,
  detail,
  children,
}: {
  label: string;
  visual: ReactNode;
  detail?: string | null;
  children: ReactNode;
}) {
  return (
    <li className={styles.stop}>
      {visual}
      <span className={styles.stopText}>
        <span>{label}</span>
        <strong>{children}</strong>
        {detail && detail !== children ? <span>{detail}</span> : null}
      </span>
    </li>
  );
}

function CategoryMark({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className={styles.mark}
      style={{ "--mark-color": categoryColor(name) } as CSSProperties}
    >
      <Icon name={categoryIcon(name)} />
    </span>
  );
}

function MerchantMark({ income, name }: { income: boolean; name: string }) {
  const brand = merchantBrand(name);
  if (brand) return <BrandMark brand={brand} />;
  return (
    <span aria-hidden className={styles.mark} data-kind="merchant">
      <Icon name={income ? "income" : "store"} />
    </span>
  );
}

type MoneyFlowProps = {
  transaction: Transaction;
  financialAccounts?: FinancialAccount[];
};

function AccountStop({
  label,
  name,
  account,
  fallback = "Account not set",
}: {
  label: string;
  name: string | null | undefined;
  account?: FinancialAccount;
  fallback?: string;
}) {
  return (
    <Stop
      detail={account?.institution}
      label={label}
      visual={<AccountBadge account={account} name={name || null} />}
    >
      {name || fallback}
    </Stop>
  );
}

function transferAccounts({ transaction, financialAccounts }: MoneyFlowProps) {
  if (transaction.backend) {
    // Owned transfers resolve UUIDs; display names may themselves contain arrows.
    const from = financialAccounts?.find(
      (account) => account.id === transaction.backend?.fromFinancialAccountId,
    );
    const to = financialAccounts?.find(
      (account) => account.id === transaction.backend?.toFinancialAccountId,
    );
    return { from, to, fromName: from?.name, toName: to?.name };
  }
  const names = (transaction.method ?? "").split("→").map((part) => part.trim());
  const [fromName, toName] = names.length === 2 ? names : [];
  return { from: undefined, to: undefined, fromName, toName };
}

function TransferMoneyFlow(props: MoneyFlowProps) {
  const accounts = transferAccounts(props);
  return (
    <ol aria-label="Money flow" className={styles.flow}>
      <AccountStop
        account={accounts.from}
        fallback="Not set"
        label="From"
        name={accounts.fromName}
      />
      <AccountStop account={accounts.to} fallback="Not set" label="To" name={accounts.toName} />
    </ol>
  );
}

const paymentFlowLabels = {
  income: { account: "Into", place: "From" },
  expense: { account: "From", place: "Where it went" },
  transfer: { account: "Account", place: "Merchant or source" },
  unknown: { account: "Account", place: "Merchant or source" },
} as const;

function PaymentMoneyFlow({ transaction, financialAccounts }: MoneyFlowProps) {
  const income = transaction.kind === "income";
  const labels = paymentFlowLabels[transaction.kind ?? "unknown"];
  const merchant = transaction.merchant || "Not provided";
  const category = transaction.category || "Not assigned";
  const savedAccount = financialAccounts?.find(
    (item) => item.id === transaction.backend?.financialAccountId,
  );
  const accountName = transaction.backend ? savedAccount?.name : transaction.method;
  const account = <AccountStop account={savedAccount} label={labels.account} name={accountName} />;
  const place = (
    <Stop label={labels.place} visual={<MerchantMark income={income} name={merchant} />}>
      {merchant}
    </Stop>
  );
  return (
    <ol aria-label="Money flow" className={styles.flow}>
      {income ? place : account}
      <Stop label="Category" visual={<CategoryMark name={category} />}>
        {category}
      </Stop>
      {income ? account : place}
    </ol>
  );
}

// Money moves from an account, through a category, to a place; income runs the other way.
function MoneyFlow(props: MoneyFlowProps) {
  return props.transaction.kind === "transfer" ? (
    <TransferMoneyFlow {...props} />
  ) : (
    <PaymentMoneyFlow {...props} />
  );
}

function TransactionInformation({
  transaction,
  details,
  pending,
  onClose,
  financialAccounts,
}: {
  transaction: Transaction;
  details: ReturnType<typeof detailsOf>;
  pending: boolean;
  onClose: () => void;
  financialAccounts?: FinancialAccount[];
}) {
  const source = sourceOf(transaction);
  return (
    <>
      <div className={styles.top}>
        {transaction.status === "confirmed" ? (
          <span />
        ) : (
          <Chip color={statusColors[transaction.status]} variant="soft">
            {statusLabels[transaction.status]}
          </Chip>
        )}
        <Button
          aria-label="Close transaction details"
          className="rounded-full"
          isDisabled={pending}
          isIconOnly
          onPress={onClose}
          variant="ghost"
        >
          <Icon name="close" />
        </Button>
      </div>
      <div className={styles.hero}>
        <p className={styles.amount} data-amount data-kind={transaction.kind ?? "unknown"}>
          {details.amount}
        </p>
        <h2 className={styles.merchant} id="transaction-details-title">
          {details.merchant}
        </h2>
        <p className={styles.when}>{details.when}</p>
      </div>
      <MoneyFlow financialAccounts={financialAccounts} transaction={transaction} />
      <p className={styles.source}>
        <Icon name={source.icon} />
        {source.label}
        {transaction.backend ? " · your private ledger" : ""}
      </p>
      {source.kind === "gmail_email" && details.editable ? (
        <p className={styles.sourceHelp}>
          You can edit this record. Its Gmail source stays unchanged.
        </p>
      ) : null}
      <details className={styles.more}>
        <summary>More details</summary>
        <dl>
          {details.rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </details>
      {details.pending && (
        <p className="mt-4 text-sm text-muted" id="transaction-review-help">
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
            financialAccounts={props.financialAccounts}
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
