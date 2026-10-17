"use client";

import type { FinancialAccount, TransactionSource } from "@monara/contracts";
import { Button, Chip } from "@monara/ui";
import { type CSSProperties, type ReactNode, type RefObject, useRef, useState } from "react";
import { AccountBadge } from "@/components/account-badge";
import { useAmountDisplay } from "@/components/app-session-context";
import { BrandMark } from "@/components/brand-mark";
import { FinanceRecovery } from "@/components/budget-manager";
import { CategoryAvatar } from "@/components/category-symbol";
import { Icon, type IconName } from "@/components/icon";
import { ModalDialog } from "@/components/modal-dialog";
import styles from "@/components/transaction-details.module.css";
import { useMerchantLogo } from "@/components/use-brand-logo";
import { categoryColor } from "@/data/category-style";
import { isCalendarDate, type Transaction, transactionErrors } from "@/data/demo-ledger";
import { FinanceClientError } from "@/lib/finance/client";

const typeLabels = { expense: "Expense", income: "Income", exclusion: "Exclusion" } as const;
const statusLabels = { pending: "Needs review", confirmed: "Confirmed" };
const statusColors = { pending: "warning", confirmed: "success" } as const;
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

// Live records state their source; demo imports are the ones carrying extraction confidence.
function sourceOf(transaction: Transaction) {
  const kind =
    transaction.backend?.source ??
    (transaction.confidence === null ? "manual_form" : "gmail_email");
  return { ...sources[kind], kind };
}

const missingLabels = {
  kind: "type",
  amount: "amount",
  currency: "currency",
  date: "date",
  category: "category",
} as const;

/** Names every detail still missing. Only confirming a non-exclusion also needs an account. */
function missingForConfirm(transaction: Transaction): string[] {
  const missing: string[] = Object.keys(transactionErrors(transaction)).map(
    (key) => missingLabels[key as keyof typeof missingLabels] ?? key,
  );
  if (transaction.status === "pending" && transaction.kind !== "exclusion" && !transaction.method)
    missing.push("account");
  return missing;
}

function listOf(items: string[]): string {
  return items.length < 2
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function detailsOf(
  transaction: Transaction,
  formatRupiah: ReturnType<typeof useAmountDisplay>["formatRupiah"],
) {
  const pending = transaction.status === "pending";
  const editable = pending || transaction.status === "confirmed";
  const missing = missingForConfirm(transaction);
  const date = isCalendarDate(transaction.date)
    ? dateFormatter.format(new Date(`${transaction.date}T00:00:00Z`))
    : "Date not provided";
  const sign = transaction.kind === "income" ? "+" : transaction.kind === "expense" ? "−" : "";
  return {
    pending,
    editable,
    valid: missing.length === 0,
    // Secondary facts stay one tap away under “More details”.
    rows: [
      ["Type", transaction.kind ? typeLabels[transaction.kind] : "Not selected"],
      ["Currency", transaction.currency || "Not provided"],
      ["Status", statusLabels[transaction.status]],
    ],
    merchant: transaction.merchant || "Transaction",
    when: transaction.time ? `${date} · ${transaction.time}` : date,
    amount:
      transaction.amount === null
        ? "Amount missing"
        : !Number.isSafeInteger(transaction.amount) ||
            transaction.amount < 0 ||
            (transaction.amount === 0 && transaction.kind !== "exclusion")
          ? "Amount invalid"
          : transaction.currency === "IDR"
            ? `${sign}${formatRupiah(transaction.amount)}`
            : "Currency missing",
    help:
      missing.length === 0
        ? "Not included in totals until confirmed."
        : pending
          ? `Add the ${listOf(missing)} to confirm, or exclude it if it isn’t a real transaction.`
          : `Add the ${listOf(missing)} to include it in your totals.`,
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
  const { formatRupiah } = useAmountDisplay();
  const effect =
    transaction.kind === "expense"
      ? "This expense will leave your spending and budgets."
      : transaction.kind === "income"
        ? "This income will leave your income totals."
        : "This exclusion will leave your history. Spending and budgets stay the same.";
  return (
    <div className="p-5 sm:p-6">
      <h2 id="transaction-details-title" className="text-xl font-bold">
        Delete transaction?
      </h2>
      <p className="mt-4 break-words text-lg font-bold">
        {transaction.merchant || "Transaction"} · {detailsOf(transaction, formatRupiah).amount}
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
  /** Opens the exclude confirmation for a pending import. */
  onExclude?: () => void;
  onDelete?: () => void | Promise<void>;
  onReject?: () => void;
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

function CategoryMark({ name, icon }: { name: string; icon?: string }) {
  return (
    <CategoryAvatar
      className={styles.mark}
      icon={icon}
      name={name}
      style={{ "--mark-color": categoryColor(name) } as CSSProperties}
    />
  );
}

function MerchantMark({ income, name }: { income: boolean; name: string }) {
  const brand = useMerchantLogo(name);
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

const paymentFlowLabels = {
  income: { account: "Into", place: "From" },
  expense: { account: "From", place: "Where it went" },
  exclusion: { account: "Account", place: "Excluded party" },
  unknown: { account: "Account", place: "Merchant or source" },
} as const;

function PaymentMoneyFlow({ transaction, financialAccounts }: MoneyFlowProps) {
  const income = transaction.kind === "income";
  const labels = paymentFlowLabels[transaction.kind ?? "unknown"];
  const merchant = transaction.merchant || "Not provided";
  const category = transaction.category || "Not assigned";
  const savedAccount = financialAccounts?.find(
    (item) =>
      item.id === (transaction.backend?.financialAccountId ?? transaction.financialAccountId),
  );
  const accountName = transaction.backend
    ? savedAccount?.name
    : (savedAccount?.name ?? transaction.method);
  const account = <AccountStop account={savedAccount} label={labels.account} name={accountName} />;
  const place = (
    <Stop label={labels.place} visual={<MerchantMark income={income} name={merchant} />}>
      {merchant}
    </Stop>
  );
  return (
    <ol aria-label="Money flow" className={styles.flow}>
      {income ? place : account}
      <Stop
        label="Category"
        visual={<CategoryMark name={category} icon={transaction.categoryIcon} />}
      >
        {category}
      </Stop>
      {income ? account : place}
    </ol>
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
        {transaction.status === "confirmed" && transaction.kind !== "exclusion" ? (
          <span />
        ) : (
          <Chip
            color={transaction.kind === "exclusion" ? "default" : statusColors[transaction.status]}
            variant="soft"
          >
            {transaction.kind === "exclusion" ? "Excluded" : statusLabels[transaction.status]}
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
      <PaymentMoneyFlow financialAccounts={financialAccounts} transaction={transaction} />
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
      {transaction.kind === "exclusion" ? (
        <p className="mt-3 text-sm text-muted">
          Kept in your history, excluded from spending, income and budgets.
        </p>
      ) : null}
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
  const {
    transaction,
    onClose,
    onEdit,
    onConfirm,
    onExclude,
    onDelete,
    confirmationError,
    onRefreshRecords,
  } = props;
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
      {details.pending ? (
        // Closing is the X or a tap outside, so the three review actions share the row equally.
        <div className="mt-6 grid grid-cols-3 gap-3">
          <Button
            className="min-h-11 w-full gap-1.5 text-danger"
            isDisabled={!onExclude || locked}
            onPress={onExclude}
            variant="secondary"
          >
            <Icon className="h-4 w-4" name="eye-off" />
            Exclude
          </Button>
          <Button
            className="min-h-11 w-full gap-1.5"
            isDisabled={locked}
            onPress={onEdit}
            variant="secondary"
          >
            <Icon className="h-4 w-4" name="pencil" />
            Edit
          </Button>
          <Button
            aria-describedby="transaction-review-help"
            className="min-h-11 w-full gap-1.5"
            isDisabled={!details.valid || locked}
            onPress={onConfirm}
          >
            <Icon className="h-4 w-4" name="check" strokeWidth={2.4} />
            {pending ? "Confirming…" : "Confirm"}
          </Button>
        </div>
      ) : (
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
            <Button className="min-h-11" variant="primary" onPress={onEdit} isDisabled={locked}>
              Edit
            </Button>
          )}
        </div>
      )}
    </>
  );
}

export function TransactionDetails(props: TransactionDetailsProps) {
  const { formatRupiah } = useAmountDisplay();
  const details = detailsOf(props.transaction, formatRupiah);
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
