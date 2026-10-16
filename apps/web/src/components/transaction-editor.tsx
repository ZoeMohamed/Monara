"use client";

import type { Category, FinancialAccount } from "@monara/contracts";
import { Button, FieldError, Form, Input, Label, ListBox, Select, TextField } from "@monara/ui";
import { type FormEvent, useReducer, useRef } from "react";
import { BrandLogoField } from "@/components/brand-logo-field";
import { FinanceRecovery } from "@/components/budget-manager";
import { Icon } from "@/components/icon";
import { ModalDialog } from "@/components/modal-dialog";
import {
  demoCategoryNames,
  demoMethods,
  demoToday,
  type Transaction,
  type TransactionErrors,
  type TransactionValues,
  transactionErrors,
} from "@/data/demo-ledger";
import { demoTransactionSelection } from "@/data/demo-resources";
import { FinanceClientError } from "@/lib/finance/client";
import { FinancePresentationError, parseDraftAmount } from "@/lib/finance/presentation";

type TransactionEditorResources = {
  financialAccounts: FinancialAccount[];
  categories: Category[];
  demo?: boolean;
};

export type TransactionDraft = {
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
  onClose: () => void;
  onSave: (values: TransactionValues, action: EditorAction) => void | Promise<void>;
  refreshRequired?: boolean;
  onRefreshRecords?: () => Promise<void>;
};
type EditorState = {
  draft: TransactionDraft;
  errors: TransactionErrors;
  phase: "editing" | "saving" | "discard";
  saveError: string | null;
  uncertain: boolean;
};
type StateAction =
  | { type: "change"; draft: TransactionDraft }
  | { type: "validate"; errors: TransactionErrors }
  | { type: "phase"; phase: EditorState["phase"] }
  | { type: "failed"; message: string; errors?: TransactionErrors; uncertain?: boolean };

function editorReducer(state: EditorState, action: StateAction): EditorState {
  switch (action.type) {
    case "change": {
      const errors = { ...state.errors };
      for (const key of Object.keys(action.draft) as (keyof TransactionDraft)[]) {
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
    case "failed":
      return {
        ...state,
        phase: "editing",
        saveError: action.message,
        errors: action.errors ?? state.errors,
        uncertain: state.uncertain || Boolean(action.uncertain),
      };
  }
}

function draftOf(
  transaction?: Transaction,
  resources?: TransactionEditorResources,
  today = demoToday,
): TransactionDraft {
  return {
    merchant: transaction?.backend
      ? (transaction.backend.merchantName ?? "")
      : (transaction?.merchant ?? ""),
    amount: transaction?.amount?.toString() ?? "",
    date: transaction ? (transaction.date ?? "") : today,
    time: transaction?.time ?? "",
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

const typeLabels = { expense: "Expense", income: "Income", exclusion: "Exclusion" } as const;
const kinds = ["Expense", "Income", "Exclusion"];

function ChoiceField({
  name,
  label,
  options,
  value,
  error,
  disabled,
  onChange,
}: {
  name: string;
  label: string;
  options: (string | { id: string; label: string; disabled?: boolean })[];
  value: string | null;
  error?: string;
  disabled: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <Select
      name={name}
      placeholder="Not selected"
      value={value}
      onChange={(key) => onChange(key === null ? null : String(key))}
      isInvalid={!!error}
      isDisabled={disabled}
      className="w-full"
      data-field={name}
    >
      <Label>{label}</Label>
      <Select.Trigger className="min-h-11" aria-invalid={!!error}>
        <Select.Value />
        <Select.ClearButton />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => {
            const choice = typeof option === "string" ? { id: option, label: option } : option;
            return (
              <ListBox.Item
                key={choice.id}
                id={choice.id}
                textValue={choice.label}
                isDisabled={choice.disabled}
              >
                {choice.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            );
          })}
        </ListBox>
      </Select.Popover>
      <FieldError>{error}</FieldError>
    </Select>
  );
}

function TransactionFields({
  draft,
  errors,
  disabled,
  onChange,
}: {
  draft: TransactionDraft;
  errors: TransactionErrors;
  disabled: boolean;
  onChange: (patch: Partial<TransactionDraft>) => void;
}) {
  const party =
    draft.kind === "income"
      ? { label: "Income source", placeholder: "e.g. Monthly salary" }
      : { label: "Merchant", placeholder: "e.g. Kopi Kenangan" };
  return (
    <>
      <TextField
        name="merchant"
        value={draft.merchant}
        onChange={(merchant) => onChange({ merchant })}
        isInvalid={!!errors.merchant}
        isDisabled={disabled}
      >
        <Label>{party.label}</Label>
        <Input autoFocus className="min-h-11 text-base" placeholder={party.placeholder} />
        <FieldError>{errors.merchant}</FieldError>
      </TextField>
      <BrandLogoField disabled={disabled} label={draft.merchant} scope="merchant" />
      <TextField
        name="amount"
        type="number"
        value={draft.amount}
        onChange={(amount) => onChange({ amount })}
        isInvalid={!!errors.amount}
        isDisabled={disabled}
      >
        <Label>Amount in rupiah</Label>
        <Input className="min-h-11 text-base" inputMode="numeric" min="1" step="1" />
        <FieldError>{errors.amount}</FieldError>
      </TextField>
      <TextField
        name="date"
        type="date"
        value={draft.date}
        onChange={(date) => onChange({ date })}
        isInvalid={!!errors.date}
        isDisabled={disabled}
      >
        <Label>Date</Label>
        <Input className="min-h-11 text-base" />
        <FieldError>{errors.date}</FieldError>
      </TextField>
    </>
  );
}

function valuesOf(
  draft: TransactionDraft,
  resources?: TransactionEditorResources,
): TransactionValues {
  return {
    merchant: draft.merchant.trim() || null,
    amount: parseDraftAmount(draft.amount),
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
  if (action === "edit") {
    for (const field of ["kind", "amount", "currency", "date", "method"] as const) {
      if (values[field] === null) delete validation[field];
    }
    if (resources && values.amount !== null && values.currency !== "IDR") {
      validation.currency = "Choose IDR for this amount.";
    }
  }
  if (!transaction) {
    if (!values.merchant) {
      validation.merchant =
        values.kind === "income" ? "Enter an income source." : "Enter a merchant.";
    }
    if (!values.method) validation.method = "Choose an account / payment method.";
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
  return {
    kind,
    ...(resources
      ? {
          method: null,
        }
      : {}),
    ...(!resources
      ? { method: draft.method && !demoMethods.includes(draft.method) ? null : draft.method }
      : {}),
  };
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

function TransactionAccountChoices({
  draft,
  errors,
  disabled,
  onChange,
  resources,
}: TransactionChoiceProps) {
  const accounts = resources?.financialAccounts.map((account) => ({
    id: account.id,
    label: `${account.name}${account.lastFour ? ` · ${account.lastFour}` : ""}`,
    disabled: !account.isActive,
  }));
  return (
    <ChoiceField
      name="method"
      label="Account / payment method"
      options={accounts ?? demoMethods}
      value={draft.method}
      error={errors.method}
      disabled={disabled}
      onChange={(method) => onChange({ method })}
    />
  );
}

function TransactionCategoryChoice({
  draft,
  disabled,
  onChange,
  resources,
}: Omit<TransactionChoiceProps, "errors">) {
  const options = resources
    ? resources.categories.map((category) => ({
        id: category.id,
        label: category.name,
        disabled: category.isArchived,
      }))
    : demoCategoryNames;
  return (
    <ChoiceField
      name="category"
      label="Category (optional)"
      options={options}
      value={draft.category}
      disabled={disabled}
      onChange={(category) => onChange({ category })}
    />
  );
}

function TransactionChoices({
  draft,
  errors,
  disabled,
  onChange,
  resources,
}: TransactionChoiceProps) {
  return (
    <>
      <ChoiceField
        name="kind"
        label="Type"
        options={kinds}
        value={draft.kind ? typeLabels[draft.kind] : null}
        error={errors.kind}
        disabled={disabled}
        onChange={(label) => onChange(kindChange(draft, label, resources))}
      />
      <ChoiceField
        name="currency"
        label="Currency"
        options={["IDR"]}
        value={draft.currency}
        error={errors.currency}
        disabled={disabled}
        onChange={(currency) => onChange({ currency: currency === "IDR" ? "IDR" : null })}
      />
      <TransactionAccountChoices
        draft={draft}
        errors={errors}
        disabled={disabled}
        onChange={onChange}
        resources={resources}
      />
      <TransactionCategoryChoice
        draft={draft}
        disabled={disabled}
        onChange={onChange}
        resources={resources}
      />
    </>
  );
}

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
}: TransactionEditorProps) {
  const [state, dispatch] = useReducer(
    editorReducer,
    null,
    (): EditorState => ({
      draft: initialDraft ?? draftOf(transaction, resources, today),
      errors: {},
      phase: "editing",
      saveError: null,
      uncertain: false,
    }),
  );
  const saving = useRef(false);
  const submitted = useRef<{ values: TransactionValues; action: EditorAction } | null>(null);
  const { draft } = state;
  const original = pristineDraft ?? draftOf(transaction, resources, today);
  const dirty = Object.keys(original).some(
    (key) => draft[key as keyof TransactionDraft] !== original[key as keyof TransactionDraft],
  );

  const changeDraft = (patch: Partial<TransactionDraft>) => {
    if (state.uncertain || refreshRequired) return;
    const next = { ...draft, ...patch };
    dispatch({ type: "change", draft: next });
    onDraftChange?.(next);
  };
  const requestClose = () => {
    if (saving.current) return;
    if (state.uncertain) return onClose();
    if (state.phase === "discard") dispatch({ type: "phase", phase: "editing" });
    else if (dirty) dispatch({ type: "phase", phase: "discard" });
    else onClose();
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving.current || refreshRequired) return;
    const action = saveActionOf(transaction, event.nativeEvent);
    const validation = validateDraft(draft, action, transaction, resources);
    dispatch({ type: "validate", errors: validation });
    const firstInvalid = Object.keys(validation)[0];
    if (firstInvalid) {
      event.currentTarget
        .querySelector<HTMLElement>(
          `input[name="${firstInvalid}"], [data-field="${firstInvalid}"] button`,
        )
        ?.focus();
      return;
    }
    saving.current = true;
    submitted.current ??= { values: valuesOf(draft, resources), action };
    dispatch({ type: "phase", phase: "saving" });
    try {
      await onSave(submitted.current.values, submitted.current.action);
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
      });
    }
  };

  return {
    state,
    changeDraft,
    requestClose,
    submit,
    keepEditing: () => dispatch({ type: "phase", phase: "editing" }),
  };
}

export function TransactionEditor(props: TransactionEditorProps) {
  const { state, changeDraft, requestClose, submit, keepEditing } =
    useTransactionEditorState(props);
  const { draft, errors } = state;
  const isSaving = state.phase === "saving";
  const locked = isSaving || state.uncertain || Boolean(props.refreshRequired);
  const labels = editorLabels(props.transaction, isSaving);

  return (
    <ModalDialog labelledBy="transaction-editor-title" onClose={requestClose}>
      {state.phase === "discard" ? (
        <DiscardChanges onKeep={keepEditing} onDiscard={props.onClose} />
      ) : (
        <Form
          className="space-y-4 p-4 sm:p-6"
          onSubmit={submit}
          validationBehavior="aria"
          aria-busy={isSaving}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="transaction-editor-title" className="text-xl font-bold">
                {labels.title}
              </h2>
              {props.resources && !props.resources.demo ? (
                <p className="mt-1 text-sm text-muted">Your private ledger</p>
              ) : null}
            </div>
            <Button
              isIconOnly
              variant="ghost"
              aria-label="Close transaction form"
              onPress={requestClose}
              isDisabled={isSaving}
            >
              <Icon name="close" />
            </Button>
          </div>
          <TransactionFields
            draft={draft}
            errors={errors}
            disabled={locked}
            onChange={changeDraft}
          />
          <TransactionChoices
            draft={draft}
            errors={errors}
            disabled={locked}
            onChange={changeDraft}
            resources={props.resources}
          />
          {Object.keys(errors).length > 0 && (
            <p role="alert" className="text-sm text-danger">
              Check the marked fields.
            </p>
          )}
          {state.saveError && (
            <p role="alert" className="text-sm text-danger">
              {state.saveError}
            </p>
          )}
          {(props.refreshRequired || state.uncertain) && (
            <FinanceRecovery
              message="Refresh your records before retrying. A retry will use the same submitted values."
              onRefreshRecords={props.onRefreshRecords}
            />
          )}
          <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-5">
            <Button
              className="min-h-11"
              variant="secondary"
              onPress={requestClose}
              isDisabled={isSaving}
            >
              Cancel
            </Button>
            {labels.pending && (
              <Button
                className="min-h-11"
                variant="secondary"
                type="submit"
                name="action"
                value="edit"
                isDisabled={locked}
              >
                Save changes
              </Button>
            )}
            <Button
              className="min-h-11"
              type="submit"
              isDisabled={isSaving || Boolean(props.refreshRequired)}
            >
              {state.uncertain && !isSaving ? "Retry same change" : labels.save}
            </Button>
          </div>
        </Form>
      )}
    </ModalDialog>
  );
}
