"use client";

import { Button, FieldError, Form, Input, Label, ListBox, Select, TextField } from "@monara/ui";
import { type FormEvent, useReducer, useRef } from "react";
import { Icon } from "@/components/icon";
import { ModalDialog } from "@/components/modal-dialog";
import {
  demoCategoryNames,
  demoMethods,
  demoToday,
  demoTransferMethods,
  type Transaction,
  type TransactionErrors,
  type TransactionValues,
  transactionErrors,
} from "@/data/demo-ledger";

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
  onDraftChange?: (draft: TransactionDraft) => void;
  onClose: () => void;
  onSave: (values: TransactionValues, action: EditorAction) => void | Promise<void>;
};
type EditorState = {
  draft: TransactionDraft;
  errors: TransactionErrors;
  phase: "editing" | "saving" | "discard";
  saveFailed: boolean;
};
type StateAction =
  | { type: "change"; draft: TransactionDraft }
  | { type: "validate"; errors: TransactionErrors }
  | { type: "phase"; phase: EditorState["phase"] }
  | { type: "failed" };

function editorReducer(state: EditorState, action: StateAction): EditorState {
  switch (action.type) {
    case "change": {
      const errors = { ...state.errors };
      for (const key of Object.keys(action.draft) as (keyof TransactionDraft)[]) {
        if (action.draft[key] !== state.draft[key]) delete errors[key];
      }
      return { ...state, draft: action.draft, errors };
    }
    case "validate":
      return { ...state, errors: action.errors, saveFailed: false };
    case "phase":
      return { ...state, phase: action.phase };
    case "failed":
      return { ...state, phase: "editing", saveFailed: true };
  }
}

function draftOf(transaction?: Transaction): TransactionDraft {
  return {
    merchant: transaction?.merchant ?? "",
    amount: transaction?.amount?.toString() ?? "",
    date: transaction ? (transaction.date ?? "") : demoToday,
    time: transaction?.time ?? "",
    kind: transaction?.kind ?? null,
    currency: transaction ? transaction.currency : "IDR",
    category: transaction?.category ?? null,
    method: transaction?.method ?? null,
  };
}

const typeLabels = { expense: "Expense", income: "Income", transfer: "Transfer" } as const;
const kinds = ["Expense", "Income", "Transfer"];

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
  options: string[];
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
          {options.map((option) => (
            <ListBox.Item key={option} id={option} textValue={option}>
              {option}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
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
  return (
    <>
      <TextField
        name="merchant"
        value={draft.merchant}
        onChange={(merchant) => onChange({ merchant })}
        isInvalid={!!errors.merchant}
        isDisabled={disabled}
      >
        <Label>Merchant or income source</Label>
        <Input autoFocus className="min-h-11 text-base" placeholder="e.g. Kopi Kenangan" />
        <FieldError>{errors.merchant}</FieldError>
      </TextField>
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

function valuesOf(draft: TransactionDraft): TransactionValues {
  return {
    merchant: draft.merchant.trim() || null,
    amount: draft.amount.trim() ? Number(draft.amount) : null,
    date: draft.date.trim() || null,
    time: draft.time.trim() || null,
    kind: draft.kind,
    currency: draft.currency,
    category: draft.category,
    method: draft.method,
  };
}

function validateDraft(
  draft: TransactionDraft,
  action: EditorAction,
  transaction?: Transaction,
): TransactionErrors {
  const values = valuesOf(draft);
  const validation = transactionErrors(values);
  if (action === "edit") {
    for (const field of ["kind", "amount", "currency", "date", "method"] as const) {
      if (values[field] === null) delete validation[field];
    }
  }
  if (!transaction) {
    if (!values.merchant) validation.merchant = "Enter a merchant or income source.";
    if (!values.method) validation.method = "Choose an account.";
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

function kindChange(draft: TransactionDraft, label: string | null): Partial<TransactionDraft> {
  const kind =
    label === "Expense"
      ? "expense"
      : label === "Income"
        ? "income"
        : label === "Transfer"
          ? "transfer"
          : null;
  const allowed = kind === "transfer" ? demoTransferMethods : demoMethods;
  return {
    kind,
    method: draft.method && !allowed.includes(draft.method) ? null : draft.method,
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

function TransactionChoices({
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
  const transfer = draft.kind === "transfer";
  return (
    <>
      <ChoiceField
        name="kind"
        label="Type"
        options={kinds}
        value={draft.kind ? typeLabels[draft.kind] : null}
        error={errors.kind}
        disabled={disabled}
        onChange={(label) => onChange(kindChange(draft, label))}
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
      <ChoiceField
        name="method"
        label={transfer ? "From → To" : "Account"}
        options={transfer ? demoTransferMethods : demoMethods}
        value={draft.method}
        error={errors.method}
        disabled={disabled}
        onChange={(method) => onChange({ method })}
      />
      <ChoiceField
        name="category"
        label="Category"
        options={demoCategoryNames}
        value={draft.category}
        disabled={disabled}
        onChange={(category) => onChange({ category })}
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
}: TransactionEditorProps) {
  const [state, dispatch] = useReducer(
    editorReducer,
    null,
    (): EditorState => ({
      draft: initialDraft ?? draftOf(transaction),
      errors: {},
      phase: "editing",
      saveFailed: false,
    }),
  );
  const saving = useRef(false);
  const { draft } = state;
  const original = pristineDraft ?? draftOf(transaction);
  const dirty = Object.keys(original).some(
    (key) => draft[key as keyof TransactionDraft] !== original[key as keyof TransactionDraft],
  );

  const changeDraft = (patch: Partial<TransactionDraft>) => {
    const next = { ...draft, ...patch };
    dispatch({ type: "change", draft: next });
    onDraftChange?.(next);
  };
  const requestClose = () => {
    if (saving.current) return;
    if (state.phase === "discard") dispatch({ type: "phase", phase: "editing" });
    else if (dirty) dispatch({ type: "phase", phase: "discard" });
    else onClose();
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving.current) return;
    const action = saveActionOf(transaction, event.nativeEvent);
    const validation = validateDraft(draft, action, transaction);
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
    dispatch({ type: "phase", phase: "saving" });
    try {
      await onSave(valuesOf(draft), action);
      // Successful saves close through the parent. Keep submissions blocked during navigation.
    } catch {
      saving.current = false;
      dispatch({ type: "failed" });
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
              <p className="mt-1 text-sm text-muted">Sample data · This session only</p>
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
            disabled={isSaving}
            onChange={changeDraft}
          />
          <TransactionChoices
            draft={draft}
            errors={errors}
            disabled={isSaving}
            onChange={changeDraft}
          />
          {Object.keys(errors).length > 0 && (
            <p role="alert" className="text-sm text-danger">
              Check the marked fields.
            </p>
          )}
          {state.saveFailed && (
            <p role="alert" className="text-sm text-danger">
              Not saved. Your entries are kept. Try saving again.
            </p>
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
                isDisabled={isSaving}
              >
                Save changes
              </Button>
            )}
            <Button className="min-h-11" type="submit" isDisabled={isSaving}>
              {labels.save}
            </Button>
          </div>
        </Form>
      )}
    </ModalDialog>
  );
}
