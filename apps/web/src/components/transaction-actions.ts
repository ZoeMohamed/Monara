"use client";

import {
  type TransactionValues as BackendTransactionValues,
  type Category,
  type FinancialAccount,
  type TransactionMutationResult,
  transactionValuesSchema,
} from "@monara/contracts";
import { type Dispatch, type SetStateAction, useRef } from "react";
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
  ): BackendTransactionValues => {
    const previous = existing?.backend;
    const categoryId =
      values.categoryId === undefined ? (previous?.categoryId ?? null) : values.categoryId;
    const financialAccountId =
      values.financialAccountId === undefined
        ? (previous?.financialAccountId ?? null)
        : values.financialAccountId;
    if (categoryId && !resources?.categories.some((category) => category.id === categoryId))
      throw new FinanceClientError(
        "VALIDATION_FAILED",
        "Choose a category from your account.",
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
      setNotice({ message: "This record could not be verified. Refresh your records." });
      return;
    }
    if (Object.keys(transactionErrors(item)).length > 0) {
      navigation.openEdit(id);
      return;
    }
    if (live && item.backend) {
      try {
        await mutate(() =>
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
              categoryId: item.backend?.categoryId,
              financialAccountId: item.backend?.financialAccountId,
            }),
          }),
        );
        setNotice({ message: "Transaction confirmed." });
        if (view.transactionId) navigation.closePopup();
      } catch (error) {
        const message =
          error instanceof FinanceClientError
            ? error.message
            : "The result could not be verified. Refresh your records.";
        setConfirmError(message);
        setNotice({ message });
      }
      return;
    }
    setTransactions((items) => updatePendingTransaction(items, id, item, "confirm"));
    setNotice({ message: "Transaction confirmed." });
    if (view.transactionId) navigation.closePopup();
  };

  const save = async (values: TransactionValues, action: "edit" | "confirm" | "correct") => {
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
      const valuesToSave = backendValues(values, editing);
      const operation =
        action === "correct"
          ? "edit_transaction"
          : action === "edit"
            ? "edit_pending"
            : "confirm_pending";
      const input = {
        transactionId: editing.id,
        expectedUpdatedAt: editing.backend.updatedAt,
        ...(action === "confirm" ? { values: valuesToSave } : { changes: valuesToSave }),
      };
      await mutate(() => callFinanceOperation(operation, input));
      setDrafts((items) => {
        const next = { ...items };
        delete next[editorKey];
        return next;
      });
      setNotice({
        message:
          action === "confirm"
            ? "Transaction confirmed."
            : action === "edit"
              ? "Changes saved. Still pending review."
              : "Transaction updated.",
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
    if (action === "correct" && expected)
      setNotice({
        message: "Transaction updated.",
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
    if (Object.keys(transactionErrors(values)).length > 0 || !values.merchant || !values.method)
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
        if (error instanceof FinanceClientError && error.actionMayHaveCompleted)
          request.locked = true;
        throw error;
      }
      delete createRequests.current[editorKey];
      setDrafts((items) => {
        const next = { ...items };
        delete next[editorKey];
        return next;
      });
      setNotice({ message: "Transaction added." });
      navigation.navigate({ adding: false, transactionId: result.transaction.id }, "replace");
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
    setNotice({ message: "Transaction added." });
    navigation.navigate({ adding: false, transactionId: record.id }, "replace");
  };

  const undo = () => {
    if (live) return;
    if (!notice?.undo) return;
    const restored =
      notice.undo.kind === "delete"
        ? undoTransactionDeletion(transactions, notice.undo.transaction, notice.undo.index)
        : undoTransactionUpdate(transactions, notice.undo.before, notice.undo.expected);
    if (restored === transactions) {
      setNotice({ message: "This transaction changed. Undo is unavailable." });
      return;
    }
    setTransactions(restored);
    setNotice({ message: "Change undone." });
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
  const closeEditor = () => {
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
    if (!live) setTransactions((items) => excludePendingTransaction(items, rejecting.id));
    navigation.closePopup();
    setNotice({ message: "Transaction excluded." });
  };

  return {
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
