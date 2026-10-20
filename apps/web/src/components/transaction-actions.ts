"use client";

import {
  type TransactionValues as BackendTransactionValues,
  type Category,
  type FinancialAccount,
  type TransactionMutationResult,
  transactionValuesSchema,
} from "@monara/contracts";
import { type Dispatch, type SetStateAction, useRef, useState } from "react";
import type { TransactionDraft } from "@/components/transaction-editor";
import type { AppNavigation } from "@/components/use-app-navigation";
import type { SaveNotice } from "@/components/use-monara-session";
import {
  deleteConfirmedTransaction,
  excludePendingTransaction,
  type RecurringBill,
  type TransactionValues,
  transactionErrors,
  undoTransactionDeletion,
  undoTransactionUpdate,
  updateConfirmedTransaction,
  updatePendingTransaction,
} from "@/data/demo-ledger";
import type { Transaction } from "@/data/sample-data";
import { callFinanceOperation, FinanceClientError } from "@/lib/finance/client";

type Setter<Value> = Dispatch<SetStateAction<Value>>;
export type CreateRequest = { id: string; values?: BackendTransactionValues; locked?: boolean };

type ActionContext = {
  live: boolean;
  resources: { financialAccounts: FinancialAccount[]; categories: Category[] } | undefined;
  transactions: Transaction[];
  editing: Transaction | undefined;
  rejecting: Transaction | undefined;
  editorKey: string;
  mutate: <Result>(operation: () => Promise<Result>) => Promise<Result>;
  navigation: AppNavigation;
  notice: SaveNotice | null;
  setNotice: Setter<SaveNotice | null>;
  setDrafts: Setter<Record<string, TransactionDraft>>;
  setTransactions: Setter<Transaction[]>;
  setRemovedId: Setter<string | null>;
  setBills: Setter<RecurringBill[]>;
  setConfirmError: Setter<string | null>;
  setRejectError: Setter<string | null>;
};

/** Coordinates presentation actions through verified backend operations, or explicit demo memory. */
export function useTransactionActions(context: ActionContext) {
  const createRequests = useRef<Record<string, CreateRequest>>({});
  const [lockedCreates, setLockedCreates] = useState<Record<string, boolean>>({});
  const undoing = useRef(false);
  const {
    live,
    resources,
    transactions,
    editing,
    rejecting,
    editorKey,
    mutate,
    navigation,
    notice,
    setNotice,
    setDrafts,
    setTransactions,
    setRemovedId,
    setBills,
    setConfirmError,
    setRejectError,
  } = context;
  const { view } = navigation;
  const backendValues = (
    values: TransactionValues,
    existing?: Transaction,
    allowUnchangedArchivedCategory = false,
  ): BackendTransactionValues => {
    const previous = existing?.backend;
    const categoryId =
      values.categoryId === undefined ? (previous?.categoryId ?? null) : values.categoryId;
    const financialAccountId =
      values.financialAccountId === undefined
        ? (previous?.financialAccountId ?? null)
        : values.financialAccountId;
    const unchangedPendingCategory =
      allowUnchangedArchivedCategory &&
      existing?.status === "pending" &&
      previous?.categoryId === categoryId;
    if (
      categoryId &&
      !resources?.categories.some(
        (category) =>
          category.id === categoryId &&
          (!category.isArchived || unchangedPendingCategory) &&
          (values.kind === null || category.kind === values.kind),
      )
    )
      throw new FinanceClientError(
        "VALIDATION_FAILED",
        "Choose a compatible category from your account.",
        null,
      );
    if (
      financialAccountId &&
      !resources?.financialAccounts.some((account) => account.id === financialAccountId)
    )
      throw new FinanceClientError(
        "VALIDATION_FAILED",
        "Choose an account from your finance space.",
        null,
      );
    return transactionValuesSchema.parse({
      kind: values.kind,
      merchantName: values.merchant,
      money:
        values.amount === null ? null : { amountMinor: String(values.amount), currency: "IDR" },
      occurredOn: values.date,
      occurredTime: values.time,
      description: previous?.description ?? null,
      location: previous?.location ?? null,
      accountHint: previous?.accountHint ?? null,
      flowDirection:
        values.kind === "exclusion"
          ? (previous?.flowDirection ??
            (previous?.kind === "expense" ? "out" : previous?.kind === "income" ? "in" : null))
          : values.kind === "expense"
            ? "out"
            : values.kind === "income"
              ? "in"
              : (previous?.flowDirection ?? null),
      categoryId,
      financialAccountId,
    });
  };

  const confirm = async (id: string) => {
    setConfirmError(null);
    const item = transactions.find(
      (transaction) => transaction.id === id && transaction.status === "pending",
    );
    if (!item) return;
    if (live && !item.backend) {
      setNotice({
        message: "This record couldn’t be checked. Refresh to load its latest details.",
        tone: "warning",
        recovery: "refresh",
      });
      return;
    }
    if (
      Object.keys(transactionErrors(item)).length > 0 ||
      (item.kind !== "exclusion" && !item.method)
    ) {
      navigation.openEdit(id);
      return;
    }
    if (live && item.backend) {
      try {
        const result = await mutate(() =>
          callFinanceOperation("confirm_pending", {
            transactionId: item.id,
            expectedUpdatedAt: item.backend?.updatedAt,
            values: transactionValuesSchema.parse({
              kind: item.backend?.kind,
              merchantName: item.backend?.merchantName,
              money: item.backend?.money,
              occurredOn: item.backend?.occurredOn,
              occurredTime: item.backend?.occurredTime,
              description: item.backend?.description,
              location: item.backend?.location,
              accountHint: item.backend?.accountHint,
              flowDirection: item.backend?.flowDirection,
              categoryId: item.backend?.categoryId,
              financialAccountId: item.backend?.financialAccountId,
            }),
          }),
        );
        setNotice({
          message: confirmationMessage(item),
          undo: { kind: "backend", receipt: result.action },
        });
        if (view.transactionId) navigation.closePopup();
      } catch (error) {
        const message =
          error instanceof FinanceClientError
            ? error.message
            : "The result could not be verified. Refresh your records.";
        setConfirmError(message);
        setNotice({ message, tone: "warning", recovery: "refresh" });
      }
      return;
    }
    const next = updatePendingTransaction(transactions, id, item, "confirm");
    const expected = next.find((transaction) => transaction.id === id);
    setTransactions(next);
    setNotice({
      message: confirmationMessage(item),
      ...(expected ? { undo: { kind: "update" as const, before: item, expected } } : {}),
    });
    if (view.transactionId) navigation.closePopup();
  };

  const save = async (
    values: TransactionValues,
    action: "edit" | "confirm" | "correct",
    expectedUpdatedAt?: string,
  ) => {
    if (!editing) throw new Error("This transaction is unavailable.");
    if (live && !editing.backend)
      throw new FinanceClientError(
        "NOT_FOUND",
        "This record could not be verified. Refresh your records.",
        null,
      );
    if (action !== "edit" && Object.keys(transactionErrors(values)).length > 0)
      throw new Error("Check the transaction details.");
    if (live && editing.backend) {
      const valuesToSave = backendValues(values, editing, action === "edit");
      const operation =
        action === "correct"
          ? "edit_transaction"
          : action === "edit"
            ? "edit_pending"
            : "confirm_pending";
      const input = {
        transactionId: editing.id,
        expectedUpdatedAt: expectedUpdatedAt ?? editing.backend.updatedAt,
        ...(action === "confirm" ? { values: valuesToSave } : { changes: valuesToSave }),
      };
      const result = await mutate(() => callFinanceOperation(operation, input));
      setDrafts((items) => {
        const next = { ...items };
        delete next[editorKey];
        return next;
      });
      setNotice({
        message:
          action === "confirm"
            ? confirmationMessage(values)
            : action === "edit"
              ? "Changes saved. Still pending review."
              : "Changes saved. Your totals are up to date.",
        undo: { kind: "backend", receipt: result.action },
      });
      navigation.navigate({ editId: null, transactionId: editing.id, adding: false }, "replace");
      return;
    }
    const next =
      action === "correct"
        ? updateConfirmedTransaction(transactions, editing.id, values)
        : updatePendingTransaction(transactions, editing.id, values, action);
    if (next === transactions)
      throw new Error("This transaction changed. Reopen it and try again.");
    const expected = next.find((item) => item.id === editing.id);
    setTransactions(next);
    setDrafts((items) => {
      const next = { ...items };
      delete next[editorKey];
      return next;
    });
    if (expected)
      setNotice({
        message:
          action === "confirm"
            ? confirmationMessage(values)
            : action === "edit"
              ? "Changes saved. Still waiting for your review."
              : "Changes saved. Your totals are up to date.",
        undo: { kind: "update", before: editing, expected },
      });
    else
      setNotice({
        message:
          action === "confirm" ? "Transaction confirmed." : "Changes saved. Still pending review.",
      });
    navigation.navigate({ editId: null, transactionId: editing.id, adding: false }, "replace");
  };

  const add = async (values: TransactionValues) => {
    if (
      Object.keys(transactionErrors(values)).length > 0 ||
      !values.merchant ||
      (values.kind !== "exclusion" && !values.method)
    )
      throw new Error("Check the transaction details.");
    if (live) {
      const nextValues = backendValues(values);
      createRequests.current[editorKey] ??= { id: crypto.randomUUID() };
      const request = createRequests.current[editorKey];
      if (request.locked && JSON.stringify(request.values) !== JSON.stringify(nextValues)) {
        throw new FinanceClientError(
          "CONFLICT",
          "A previous save may have completed. Retry the original details, or check History before starting another transaction.",
          null,
          true,
        );
      }
      request.values = nextValues;
      let result: TransactionMutationResult;
      try {
        result = await mutate(() =>
          callFinanceOperation("add_transaction", {
            ...request.values,
            clientRequestId: request.id,
          }),
        );
      } catch (error) {
        if (error instanceof FinanceClientError && error.actionMayHaveCompleted) {
          request.locked = true;
          setLockedCreates((current) => ({ ...current, [editorKey]: true }));
        }
        throw error;
      }
      delete createRequests.current[editorKey];
      setLockedCreates((current) => ({ ...current, [editorKey]: false }));
      setDrafts((items) => {
        const next = { ...items };
        delete next[editorKey];
        return next;
      });
      setNotice({
        message: "Transaction added.",
        undo: { kind: "backend", receipt: result.action },
      });
      navigation.navigate({ adding: false }, "replace");
      return;
    }
    const record: Transaction = {
      ...values,
      id: crypto.randomUUID(),
      emoji: "✦",
      confidence: null,
      status: "confirmed",
    };
    setTransactions((items) => [record, ...items]);
    setDrafts((items) => {
      const next = { ...items };
      delete next[editorKey];
      return next;
    });
    setNotice({
      message: "Transaction added.",
      undo: { kind: "create", transaction: record },
    });
    navigation.navigate({ adding: false }, "replace");
  };

  const undo = async () => {
    if (undoing.current) return;
    if (!notice?.undo) return;
    if (notice.undo.kind === "backend") {
      const receipt = notice.undo.receipt;
      if (Date.parse(receipt.undoExpiresAt) <= Date.now()) {
        setNotice({
          message: "Undo has expired. Open the record to make another change.",
          tone: "warning",
          recovery: "history",
        });
        return;
      }
      undoing.current = true;
      try {
        await mutate(() => callFinanceOperation("undo_action", { actionId: receipt.actionId }));
        setNotice({ message: "Change undone. Your totals are up to date." });
      } catch (error) {
        setNotice({
          message:
            error instanceof FinanceClientError && error.actionMayHaveCompleted
              ? "Undo may have completed. Refresh to check before trying again."
              : error instanceof FinanceClientError && error.code === "CONFLICT"
                ? "This record changed or its Undo expired. Open History to review it."
                : "Undo couldn’t be completed. Refresh to check the latest record.",
          tone: "warning",
          recovery:
            error instanceof FinanceClientError && error.code === "CONFLICT"
              ? "history"
              : "refresh",
        });
      } finally {
        undoing.current = false;
      }
      return;
    }
    if (live) return;
    const restored =
      notice.undo.kind === "delete"
        ? undoTransactionDeletion(transactions, notice.undo.transaction, notice.undo.index)
        : notice.undo.kind === "create"
          ? deleteConfirmedTransaction(transactions, notice.undo.transaction)
          : undoTransactionUpdate(transactions, notice.undo.before, notice.undo.expected);
    if (restored === transactions) {
      setNotice({
        message: "This transaction changed since then. Open History to review its latest details.",
        tone: "warning",
        recovery: "history",
      });
      return;
    }
    setTransactions(restored);
    setRemovedId(null);
    setNotice({ message: "Change undone. Your totals are up to date." });
  };

  const deleteTransaction = async (transaction: Transaction) => {
    if (live && !transaction.backend)
      throw new FinanceClientError(
        "NOT_FOUND",
        "This record could not be verified. Refresh your records.",
        null,
      );
    if (live && transaction.backend) {
      await mutate(() =>
        callFinanceOperation("delete_transaction", {
          transactionId: transaction.id,
          expectedUpdatedAt: transaction.backend?.updatedAt,
        }),
      );
      setRemovedId(transaction.id);
      setNotice({ message: "Transaction deleted. Undo is not available for saved records." });
      navigation.navigate({ transactionId: null }, "replace");
      return;
    }
    const next = deleteConfirmedTransaction(transactions, transaction);
    if (next === transactions)
      throw new Error("This transaction changed. Reopen it and try again.");
    setRemovedId(transaction.id);
    setTransactions(next);
    setNotice({
      message: "Transaction deleted.",
      undo: { kind: "delete", transaction, index: transactions.indexOf(transaction) },
    });
    setDrafts((items) => {
      const next = { ...items };
      delete next[transaction.id];
      return next;
    });
    navigation.navigate({ transactionId: null }, "replace");
  };

  const confirmBill = (id: string) => {
    setBills((items) =>
      items.map((bill) => (bill.id === id ? { ...bill, status: "active" } : bill)),
    );
    setNotice({ message: "Bill tracked." });
  };
  const dismissBill = (id: string) => {
    setBills((items) => items.filter((bill) => bill.id !== id));
    setNotice({ message: "Suggestion dismissed." });
  };
  const closeEditor = (preserveDraft = false) => {
    if (preserveDraft === true || createRequests.current[editorKey]?.locked) {
      setNotice({
        message: "Your submitted details are kept for this visit. Check History before retrying.",
        tone: "warning",
        recovery: "history",
      });
      navigation.closePopup();
      return;
    }
    delete createRequests.current[editorKey];
    setDrafts((items) => {
      const next = { ...items };
      delete next[editorKey];
      return next;
    });
    navigation.closePopup();
  };
  const rejectSelected = async () => {
    if (!rejecting) return;

    setRejectError(null);
    if (live && !rejecting.backend) {
      setRejectError("This record could not be verified. Refresh your records.");
      return;
    }
    if (live && rejecting.backend) {
      try {
        await mutate(() =>
          callFinanceOperation("exclude_pending", {
            transactionId: rejecting.id,
            expectedUpdatedAt: rejecting.backend?.updatedAt,
          }),
        );
      } catch (error) {
        setRejectError(
          error instanceof FinanceClientError
            ? error.message
            : "The result could not be verified. Refresh your records.",
        );
        return;
      }
    }
    setRemovedId(rejecting.id);
    const next = live ? transactions : excludePendingTransaction(transactions, rejecting.id);
    const expected = next.find((transaction) => transaction.id === rejecting.id);
    if (!live) setTransactions(next);
    navigation.closePopup();
    setNotice({
      message: "Moved to Exclusions. It won’t count toward your totals.",
      ...(!live && expected
        ? { undo: { kind: "update" as const, before: rejecting, expected } }
        : {}),
    });
  };

  return {
    lockedCreate: Boolean(lockedCreates[editorKey]),
    confirm,
    save,
    add,
    undo,
    deleteTransaction,
    confirmBill,
    dismissBill,
    closeEditor,
    rejectSelected,
  };
}

function confirmationMessage(transaction: Pick<TransactionValues, "kind">) {
  if (transaction.kind === "exclusion")
    return "Confirmed as an exclusion. Kept in History, with totals unchanged.";
  return transaction.kind === "income"
    ? "Confirmed. Included in your income totals."
    : "Confirmed. Included in spending and budgets.";
}
