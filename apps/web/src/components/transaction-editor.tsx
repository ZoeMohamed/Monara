"use client";

import type { Category, FinancialAccount } from "@monara/contracts";
import { Button, Form } from "@monara/ui";
import { type FormEvent, useEffect, useReducer, useRef, useState } from "react";
import { BrandLogoField } from "@/components/brand-logo-field";
import { FinanceRecovery } from "@/components/budget-manager";
import { ModalDialog } from "@/components/modal-dialog";
import { type QuickAddChoice, QuickAddFields } from "@/components/quick-add-fields";
import {
  demoCategoryNames,
  demoExclusionNames,
  demoIncomeNames,
  demoMethods,
  demoToday,
  formatUsdMinor,
  type Transaction,
  type TransactionErrors,
  type TransactionValues,
  transactionErrors,
} from "@/data/demo-ledger";
import { demoTransactionSelection } from "@/data/demo-resources";
import { protectUnsavedChanges } from "@/lib/auth/local-user-state";
import { FinanceClientError } from "@/lib/finance/client";
import { FinancePresentationError, parseDraftAmount } from "@/lib/finance/presentation";

type TransactionEditorResources = {
  financialAccounts: FinancialAccount[];
  categories: Category[];
  demo?: boolean;
};

export type TransactionDraft = {
  reviewedUpdatedAt?: string;
  merchant: string;
  amount: string;
  date: string;
  time: string;
  kind: Transaction["kind"];
  currency: Transaction["currency"];
  category: string | null;
  method: string | null;
};

type EditorAction = "edit" | "confirm" | "correct";
type TransactionEditorProps = {
  transaction?: Transaction;
  initialDraft?: TransactionDraft;
  pristineDraft?: TransactionDraft;
  resources?: TransactionEditorResources;
  today?: string;
  onDraftChange?: (draft: TransactionDraft) => void;
  onClose: (preserveDraft?: boolean) => void;
  initialUncertain?: boolean;
  onSave: (
    values: TransactionValues,
    action: EditorAction,
    expectedUpdatedAt?: string,
  ) => void | Promise<void>;
  refreshRequired?: boolean;
  onRefreshRecords?: () => Promise<void>;
};
type EditorState = {
  draft: TransactionDraft;
  errors: TransactionErrors;
  phase: "editing" | "saving" | "discard";
  saveError: string | null;
  uncertain: boolean;
  needsLatest: boolean;
};
type StateAction =
  | { type: "change"; draft: TransactionDraft }
  | { type: "validate"; errors: TransactionErrors }
  | { type: "phase"; phase: EditorState["phase"] }
  | {
      type: "failed";
      message: string;
      errors?: TransactionErrors;
      uncertain?: boolean;
      needsLatest?: boolean;
    }
  | { type: "reviewed"; draft: TransactionDraft };

function editorReducer(state: EditorState, action: StateAction): EditorState {
  switch (action.type) {
    case "change": {
      const errors = { ...state.errors };
      for (const key of Object.keys(action.draft) as (keyof TransactionDraft)[]) {
        if (key === "reviewedUpdatedAt") continue;
        if (action.draft[key] !== state.draft[key]) {
          delete errors[key];
        }
      }
      return { ...state, draft: action.draft, errors };
    }
    case "validate":
      return { ...state, errors: action.errors, saveError: null };
    case "phase":
      return { ...state, phase: action.phase };
    case "reviewed":
      return {
        draft: action.draft,
        errors: {},
        phase: "editing",
        saveError: null,
        uncertain: false,
        needsLatest: false,
      };
    case "failed":
      return {
        ...state,
        phase: "editing",
        saveError: action.message,
        errors: action.errors ?? state.errors,
        uncertain: state.uncertain || Boolean(action.uncertain),
        needsLatest: Boolean(action.needsLatest),
      };
  }
}

function draftOf(
  transaction?: Transaction,
  resources?: TransactionEditorResources,
  today = demoToday,
): TransactionDraft {
  return {
    reviewedUpdatedAt: transaction?.backend?.updatedAt,
    merchant: transaction?.backend
      ? (transaction.backend.merchantName ?? "")
      : (transaction?.merchant ?? ""),
    amount:
      transaction?.amount == null
        ? ""
        : transaction.currency === "USD"
          ? `${Math.floor(transaction.amount / 100)}.${String(transaction.amount % 100).padStart(2, "0")}`
          : transaction.amount.toString(),
    date: transaction ? (transaction.date ?? "") : today,
    // Time is not edited here; retain source seconds through unrelated corrections.
    time: transaction?.backend
      ? (transaction.backend.occurredTime ?? "")
      : (transaction?.time ?? ""),
    kind: transaction?.kind ?? null,
    currency: transaction ? transaction.currency : "IDR",
    category: resources
      ? (transaction?.backend?.categoryId ??
        (resources.demo
          ? resources.categories.find((category) => category.name === transaction?.category)?.id
          : null) ??
        null)
      : (transaction?.category ?? null),
    method: resources
      ? (transaction?.backend?.financialAccountId ??
        transaction?.financialAccountId ??
        (resources.demo
          ? resources.financialAccounts.find((account) => account.name === transaction?.method)?.id
          : null) ??
        null)
      : (transaction?.method ?? null),
  };
}

/** The account used for the last transaction added in this tab, so the next one starts there. */
let lastAccountId: string | null = null;

/** A new transaction starts on the account used last, or the first active one. */
function defaultAccountId(resources: TransactionEditorResources | undefined) {
  const active = resources?.financialAccounts.filter((account) => account.isActive) ?? [];
  return (active.find((account) => account.id === lastAccountId) ?? active[0])?.id ?? null;
}

function withDefaultAccount(
  draft: TransactionDraft,
  resources: TransactionEditorResources | undefined,
): TransactionDraft {
  return draft.method === null ? { ...draft, method: defaultAccountId(resources) } : draft;
}

function quickAccountChoices(
  draft: TransactionDraft,
  resources?: TransactionEditorResources,
): QuickAddChoice[] {
  if (!resources) return demoMethods.map((name) => ({ id: name, label: name }));
  return resources.financialAccounts
    .filter((account) => account.isActive || account.id === draft.method)
    .map((account) => ({
      id: account.id,
      label: `${account.name}${account.lastFour ? ` · ${account.lastFour}` : ""}`,
      account,
      disabled: !account.isActive,
    }));
}

function quickCategoryChoices(
  draft: TransactionDraft,
  resources?: TransactionEditorResources,
): QuickAddChoice[] {
  if (resources) {
    return resources.categories
      .filter((category) =>
        draft.kind === null
          ? category.id === draft.category
          : category.kind === draft.kind &&
            (!category.isArchived || category.id === draft.category),
      )
      .map((category) => ({
        id: category.id,
        label: category.name,
        icon: category.icon,
        disabled: category.isArchived,
      }));
  }
  const names =
    draft.kind === "exclusion"
      ? demoExclusionNames
      : draft.kind === "income"
        ? demoIncomeNames
        : demoCategoryNames;
  return names.map((name) => ({ id: name, label: name }));
}

function valuesOf(
  draft: TransactionDraft,
  resources?: TransactionEditorResources,
): TransactionValues {
  return {
    merchant: draft.merchant.trim() || null,
    amount: parseDraftAmount(draft.amount, draft.currency),
    date: draft.date.trim() || null,
    time: draft.time.trim() || null,
    kind: draft.kind,
    currency: draft.currency,
    ...(resources?.demo
      ? demoTransactionSelection(draft, resources)
      : {
          category: draft.category,
          categoryIcon: resources?.categories.find((category) => category.id === draft.category)
            ?.icon,
          categoryKind: resources?.categories.find((category) => category.id === draft.category)
            ?.kind,
          method: draft.method,
          ...(resources
            ? {
                categoryId: draft.category,
                financialAccountId: draft.method,
              }
            : {}),
        }),
  };
}

function validateDraft(
  draft: TransactionDraft,
  action: EditorAction,
  transaction?: Transaction,
  resources?: TransactionEditorResources,
): TransactionErrors {
  let values: TransactionValues;
  try {
    values = valuesOf(draft, resources);
  } catch (error) {
    if (error instanceof FinancePresentationError) return { amount: error.message };
    throw error;
  }
  const validation = transactionErrors(values);
  // Confirming an exclusion needs no account; creating any transaction still does (below).
  if (action !== "edit" && !values.method && values.kind !== "exclusion")
    validation.method = "Choose the account used for this transaction.";
  if (action === "edit") {
    for (const field of ["kind", "amount", "currency", "date", "method"] as const) {
      if (values[field] === null) delete validation[field];
    }
    if (
      resources &&
      values.amount !== null &&
      values.currency !== "IDR" &&
      values.currency !== "USD"
    ) {
      validation.currency = "Choose IDR or USD for this amount.";
    }
  }
  if (!transaction) {
    if (!values.merchant) {
      validation.merchant =
        values.kind === "income" ? "Enter an income source." : "Enter a merchant.";
    }
    if (!values.method) validation.method = "Choose an account.";
    if (values.amount === null) validation.amount = "Enter the transaction amount.";
  }
  if (
    resources &&
    draft.method &&
    !resources.financialAccounts.some((account) => account.id === draft.method && account.isActive)
  )
    validation.method = "This account is no longer active. Choose an active account.";
  const unchangedPendingCategory =
    action === "edit" &&
    transaction?.status === "pending" &&
    draft.category === draftOf(transaction, resources).category;
  if (resources && draft.category) {
    const category = resources.categories.find((item) => item.id === draft.category);
    if (!category || (category.isArchived && !unchangedPendingCategory))
      validation.category = "Choose an available category. This category was archived or removed.";
    else if (draft.kind !== null && category.kind !== draft.kind)
      validation.category = "Choose an available category matching this transaction type.";
  }
  return validation;
}

function DiscardChanges({ onKeep, onDiscard }: { onKeep: () => void; onDiscard: () => void }) {
  return (
    <div className="p-5 sm:p-6">
      <h2 id="transaction-editor-title" className="text-xl font-bold">
        Discard changes?
      </h2>
      <p className="mt-2 text-sm text-muted">Your changes have not been saved.</p>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button className="min-h-11" variant="secondary" onPress={onDiscard}>
          Discard changes
        </Button>
        <Button autoFocus className="min-h-11" onPress={onKeep}>
          Keep editing
        </Button>
      </div>
    </div>
  );
}

function saveActionOf(transaction: Transaction | undefined, event: Event): EditorAction {
  if (transaction?.status === "confirmed") return "correct";
  const submitter = event instanceof SubmitEvent ? event.submitter : null;
  return submitter instanceof HTMLButtonElement && submitter.value === "edit" ? "edit" : "confirm";
}

function kindChange(
  draft: TransactionDraft,
  label: string | null,
  resources?: TransactionEditorResources,
): Partial<TransactionDraft> {
  const kind =
    label === "Expense"
      ? "expense"
      : label === "Income"
        ? "income"
        : label === "Exclusion"
          ? "exclusion"
          : null;
  const category = resources?.categories.find((category) => category.id === draft.category);
  const compatibleCategory =
    kind === null ||
    (resources
      ? category?.kind === kind
      : (kind === "exclusion"
          ? demoExclusionNames
          : kind === "income"
            ? demoIncomeNames
            : demoCategoryNames
        ).some((name) => name === draft.category));
  return { kind, category: compatibleCategory ? draft.category : null };
}

function editorLabels(transaction: Transaction | undefined, isSaving: boolean) {
  const confirmed = transaction?.status === "confirmed";
  const pending = transaction?.status === "pending";
  return {
    pending,
    title: confirmed ? "Edit transaction" : pending ? "Review transaction" : "New transaction",
    save: isSaving
      ? "Saving…"
      : confirmed
        ? "Save changes"
        : pending
          ? "Confirm"
          : "Save transaction",
  };
}

type TransactionChoiceProps = {
  draft: TransactionDraft;
  errors: TransactionErrors;
  disabled: boolean;
  onChange: (patch: Partial<TransactionDraft>) => void;
  resources?: TransactionEditorResources;
};

function useTransactionEditorState({
  transaction,
  initialDraft,
  pristineDraft,
  onDraftChange,
  onClose,
  onSave,
  resources,
  today,
  refreshRequired,
  initialUncertain = false,
}: TransactionEditorProps) {
  const [state, dispatch] = useReducer(
    editorReducer,
    null,
    (): EditorState => ({
      draft: transaction
        ? (initialDraft ?? draftOf(transaction, resources, today))
        : withDefaultAccount(initialDraft ?? draftOf(transaction, resources, today), resources),
      errors: {},
      phase: "editing",
      saveError: null,
      uncertain: initialUncertain,
      needsLatest: false,
    }),
  );
  const saving = useRef(false);
  const submitted = useRef<{
    values: TransactionValues;
    action: EditorAction;
    expectedUpdatedAt?: string;
  } | null>(null);
  const [reviewed, setReviewed] = useState(() => ({
    version: initialDraft?.reviewedUpdatedAt ?? transaction?.backend?.updatedAt,
    draft: transaction
      ? (pristineDraft ?? draftOf(transaction, resources, today))
      : withDefaultAccount(pristineDraft ?? draftOf(transaction, resources, today), resources),
  }));
  const changedElsewhere =
    transaction?.backend !== undefined && transaction.backend.updatedAt !== reviewed.version;
  const { draft } = state;
  const original = reviewed.draft;
  const dirty = Object.keys(original).some(
    (key) =>
      key !== "reviewedUpdatedAt" &&
      draft[key as keyof TransactionDraft] !== original[key as keyof TransactionDraft],
  );
  useEffect(() => {
    if (!dirty && !state.uncertain && state.phase !== "saving") return;
    const protectDraft = (event: BeforeUnloadEvent) => {
      protectUnsavedChanges(event);
    };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [dirty, state.uncertain, state.phase]);

  const changeDraft = (patch: Partial<TransactionDraft>) => {
    if (state.uncertain || refreshRequired) return;
    const next = { ...draft, ...patch };
    dispatch({ type: "change", draft: next });
    onDraftChange?.(next);
  };
  const requestClose = () => {
    if (saving.current) return;
    if (state.uncertain) return onClose(true);
    if (state.phase === "discard") dispatch({ type: "phase", phase: "editing" });
    else if (dirty) dispatch({ type: "phase", phase: "discard" });
    else onClose();
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving.current || refreshRequired || changedElsewhere) return;
    const action = saveActionOf(transaction, event.nativeEvent);
    const validation = validateDraft(draft, action, transaction, resources);
    dispatch({ type: "validate", errors: validation });
    const firstInvalid = Object.keys(validation)[0];
    if (firstInvalid) {
      event.currentTarget
        .querySelector<HTMLElement>(
          `input[name="${firstInvalid}"], select[name="${firstInvalid}"], [data-field="${firstInvalid}"] button`,
        )
        ?.focus();
      return;
    }
    saving.current = true;
    if (!transaction && draft.method) lastAccountId = draft.method;
    submitted.current ??= {
      values: valuesOf(draft, resources),
      action,
      expectedUpdatedAt: reviewed.version,
    };
    dispatch({ type: "phase", phase: "saving" });
    try {
      await onSave(
        submitted.current.values,
        submitted.current.action,
        submitted.current.expectedUpdatedAt,
      );
      // Successful saves close through the parent. Keep submissions blocked during navigation.
    } catch (error) {
      saving.current = false;
      const uncertain = error instanceof FinanceClientError && error.actionMayHaveCompleted;
      if (!uncertain && !state.uncertain) submitted.current = null;
      const fieldMap: Record<string, keyof TransactionValues> = {
        merchantName: "merchant",
        money: "amount",
        occurredOn: "date",
        kind: "kind",
        categoryId: "category",
        financialAccountId: "method",
      };
      const errors: TransactionErrors = {};
      if (error instanceof FinanceClientError && error.fieldErrors) {
        for (const [key, messages] of Object.entries(error.fieldErrors)) {
          const path = key.replace(/^(?:values|changes)\./, "").split(".")[0];
          const field = fieldMap[path];
          if (field && messages[0]) errors[field] = messages[0];
        }
      }
      dispatch({
        type: "failed",
        message:
          error instanceof FinanceClientError
            ? error.message
            : "Your entries are kept. Check your records and try again.",
        errors,
        uncertain,
        needsLatest:
          error instanceof FinanceClientError &&
          (error.code === "CONFLICT" || error.code === "NOT_FOUND"),
      });
    }
  };

  return {
    state,
    changeDraft,
    requestClose,
    submit,
    keepEditing: () => dispatch({ type: "phase", phase: "editing" }),
    changedElsewhere,
    reviewLatest: (useCurrent: boolean) => {
      if (!transaction || refreshRequired) return;
      const latest = draftOf(transaction, resources, today);
      const nextDraft = useCurrent
        ? latest
        : { ...draft, reviewedUpdatedAt: transaction.backend?.updatedAt };
      submitted.current = null;
      setReviewed({ version: transaction.backend?.updatedAt, draft: latest });
      dispatch({ type: "reviewed", draft: nextDraft });
      onDraftChange?.(nextDraft);
    },
  };
}

type EditorFieldsProps = TransactionChoiceProps & {
  props: TransactionEditorProps;
  requestClose: () => void;
  saving: boolean;
  changedElsewhere: boolean;
  reviewLatest: (useCurrent: boolean) => void;
};

/** Creation, review, and correction share the same amount-first fields. */
function EditorFields({
  props,
  draft,
  errors,
  disabled,
  onChange,
  requestClose,
  saving,
  changedElsewhere,
  reviewLatest,
}: EditorFieldsProps) {
  const { transaction, resources } = props;
  return (
    <>
      {changedElsewhere && transaction ? (
        <LatestTransaction
          transaction={transaction}
          onUseLatest={() => reviewLatest(true)}
          onKeepDraft={() => reviewLatest(false)}
          disabled={Boolean(props.refreshRequired)}
        />
      ) : null}
      <QuickAddFields
        accounts={quickAccountChoices(draft, resources)}
        categories={quickCategoryChoices(draft, resources)}
        disabled={disabled}
        draft={draft}
        errors={errors}
        onChange={onChange}
        closeDisabled={saving}
        onClose={requestClose}
        onKind={(label) => onChange(kindChange(draft, label, resources))}
        today={props.today ?? demoToday}
        merchantAccessory={
          transaction ? (
            <BrandLogoField disabled={disabled} label={draft.merchant} scope="merchant" />
          ) : undefined
        }
      />
    </>
  );
}

export function TransactionEditor(props: TransactionEditorProps) {
  const { state, changeDraft, requestClose, submit, keepEditing, changedElsewhere, reviewLatest } =
    useTransactionEditorState(props);
  const isSaving = state.phase === "saving";
  const locked = isSaving || state.uncertain || changedElsewhere || Boolean(props.refreshRequired);
  const labels = editorLabels(props.transaction, isSaving);

  return (
    <ModalDialog labelledBy="transaction-editor-title" onClose={requestClose}>
      {state.phase === "discard" ? (
        <DiscardChanges onKeep={keepEditing} onDiscard={() => props.onClose()} />
      ) : (
        <Form
          className="space-y-4 p-4 sm:p-5"
          onSubmit={submit}
          validationBehavior="aria"
          aria-busy={isSaving}
        >
          {/* The amount-first sheet keeps its title available to screen readers. */}
          <h2 id="transaction-editor-title" className="sr-only">
            {labels.title}
          </h2>
          <EditorFields
            changedElsewhere={changedElsewhere}
            disabled={locked}
            draft={state.draft}
            errors={state.errors}
            onChange={changeDraft}
            props={props}
            requestClose={requestClose}
            resources={props.resources}
            reviewLatest={reviewLatest}
            saving={isSaving}
          />
          <EditorFeedback
            state={state}
            changedElsewhere={changedElsewhere}
            refreshRequired={props.refreshRequired}
            onRefreshRecords={props.onRefreshRecords}
          />
          <EditorFooter
            labels={labels}
            state={state}
            locked={locked}
            reviewRequired={changedElsewhere || Boolean(props.refreshRequired)}
          />
        </Form>
      )}
    </ModalDialog>
  );
}

function EditorFooter({
  labels,
  state,
  locked,
  reviewRequired,
}: {
  labels: ReturnType<typeof editorLabels>;
  state: EditorState;
  locked: boolean;
  reviewRequired: boolean;
}) {
  const isSaving = state.phase === "saving";
  return (
    <div className="sticky bottom-0 -mx-4 -mb-4 flex gap-2 bg-surface px-4 pt-2 pb-4 sm:-mx-5 sm:-mb-5 sm:px-5 sm:pb-5">
      {labels.pending ? (
        <Button
          className="min-h-12 min-w-0 flex-1 text-base"
          variant="secondary"
          type="submit"
          name="action"
          value="edit"
          isDisabled={locked}
        >
          Save changes
        </Button>
      ) : null}
      <Button
        className="min-h-12 min-w-0 flex-1 text-base"
        type="submit"
        isDisabled={isSaving || reviewRequired}
      >
        {state.uncertain && !isSaving ? "Retry same change" : labels.save}
      </Button>
    </div>
  );
}

function EditorFeedback({
  state,
  changedElsewhere,
  refreshRequired,
  onRefreshRecords,
}: {
  state: EditorState;
  changedElsewhere: boolean;
  refreshRequired?: boolean;
  onRefreshRecords?: () => Promise<void>;
}) {
  return (
    <>
      {Object.keys(state.errors).length > 0 ? (
        <p role="alert" className="text-sm text-danger">
          Check the marked fields. Your entries are still here.
        </p>
      ) : null}
      {state.saveError ? (
        <p role="alert" className="text-sm text-danger">
          {state.saveError}
        </p>
      ) : null}
      {(refreshRequired || state.uncertain || state.needsLatest) && !changedElsewhere ? (
        <FinanceRecovery
          message={
            state.uncertain
              ? "The save may have completed. Your submitted details are kept. Refresh to check the result before retrying."
              : "Your entries are kept. Refresh to check the latest record before saving again."
          }
          onRefreshRecords={onRefreshRecords}
        />
      ) : null}
    </>
  );
}

function LatestTransaction({
  transaction,
  onUseLatest,
  onKeepDraft,
  disabled,
}: {
  transaction: Transaction;
  onUseLatest: () => void;
  onKeepDraft: () => void;
  disabled: boolean;
}) {
  return (
    <section
      aria-label="Updated transaction"
      className="space-y-3 rounded-2xl border border-warning/40 bg-warning/10 p-4"
    >
      <h3 className="font-bold">This transaction changed elsewhere</h3>
      <p className="text-sm leading-6 text-muted">
        Your entries are kept in the form. Compare them with the latest saved details before
        choosing what to save.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt>Merchant</dt>
        <dd className="break-words font-semibold">{transaction.merchant ?? "Not provided"}</dd>
        <dt>Amount</dt>
        <dd data-amount>
          {transaction.amount == null
            ? "Not provided"
            : transaction.currency === "USD"
              ? formatUsdMinor(transaction.amount)
              : `${transaction.amount.toLocaleString("en-US")} ${transaction.currency ?? ""}`}
        </dd>
        <dt>Date</dt>
        <dd>{transaction.date ?? "Not provided"}</dd>
        <dt>Type</dt>
        <dd>{transaction.kind ?? "Not selected"}</dd>
        <dt>Category</dt>
        <dd>{transaction.category ?? "Not selected"}</dd>
        <dt>Account</dt>
        <dd>{transaction.method ?? "Not selected"}</dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button isDisabled={disabled} onPress={onUseLatest} variant="secondary">
          Use latest details
        </Button>
        <Button isDisabled={disabled} onPress={onKeepDraft}>
          Keep my entries
        </Button>
      </div>
    </section>
  );
}
