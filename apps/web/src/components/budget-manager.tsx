"use client";

import {
  type Budget,
  type BudgetMutationResult,
  type BudgetUsage,
  type CreateBudgetInput,
  createBudgetInputSchema,
  isExclusionCategoryName,
  type UpdateBudgetInput,
  updateBudgetInputSchema,
} from "@monara/contracts";
import {
  Button,
  FieldError,
  Input,
  Label,
  ListBox,
  ProgressBar,
  Select,
  Switch,
  TextField,
} from "@monara/ui";
import { type FormEvent, Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { useAmountDisplay } from "@/components/app-session-context";
import { BudgetDetails, type BudgetDetailsRecord } from "@/components/budget-details";
import styles from "@/components/budget-manager.module.css";
import { BudgetSuggestionPanel } from "@/components/budget-suggestion";
import { CategoryCreator } from "@/components/category-creator";
import { CategoryAvatar } from "@/components/category-symbol";
import { Icon } from "@/components/icon";
import { ModalDialog } from "@/components/modal-dialog";
import { formatDay } from "@/data/demo-ledger";
import {
  budgetCategoryError,
  type BudgetDraft as Draft,
  budgetDraftOf as draftOf,
  rebaseBudgetDraft,
} from "@/lib/finance/budget-draft";
import { callFinanceOperation, FinanceClientError } from "@/lib/finance/client";
import {
  FinancePresentationError,
  type FinanceSnapshot,
  parseDraftAmount,
} from "@/lib/finance/presentation";

export type FinanceManagerProps = {
  snapshot: FinanceSnapshot;
  runMutation: <Result>(operation: () => Promise<Result>) => Promise<Result>;
  refreshRequired?: boolean;
  onRefreshRecords?: () => Promise<void>;
};

type FormErrors = Partial<Record<keyof Draft, string>>;
type BudgetRequest = {
  operation: "create_budget" | "edit_budget";
  input: CreateBudgetInput | UpdateBudgetInput;
  values: Draft;
  priorIds: Set<string>;
};

function formErrors(issues: { path: readonly PropertyKey[]; message: string }[]): FormErrors {
  const errors: FormErrors = {};
  const messages: FormErrors = {
    name: "Add a budget name, up to 100 characters.",
    amount: "Enter a positive whole amount of rupiah.",
    startsOn: "Choose a valid start date.",
    warningPercent: "Enter a warning percentage from 1 to 100.",
    cadence: "Choose a weekly or monthly period.",
  };
  for (const issue of issues) {
    const key = issue.path[0] === "changes" ? issue.path[1] : issue.path[0];
    const field = key === "limit" ? "amount" : key;
    if (typeof field === "string")
      errors[field as keyof Draft] ??= messages[field as keyof Draft] ?? issue.message;
  }
  return errors;
}

export function FinanceRecovery({
  message,
  onRefreshRecords,
}: {
  message: string;
  onRefreshRecords?: () => Promise<void>;
}) {
  const [state, setState] = useState({ pending: false, error: null as string | null });
  const inFlight = useRef(false);
  const refresh = async () => {
    if (!onRefreshRecords || inFlight.current) return;
    inFlight.current = true;
    setState({ pending: true, error: null });
    try {
      await onRefreshRecords();
      setState({ pending: false, error: null });
    } catch {
      setState({ pending: false, error: "Your records could not be refreshed. Please try again." });
    } finally {
      inFlight.current = false;
    }
  };
  return (
    <div className={styles.recovery} role="status">
      <p className="text-sm leading-6">{message}</p>
      {state.error && <p className={styles.error}>{state.error}</p>}
      {onRefreshRecords && (
        <Button
          className="min-h-11"
          isDisabled={state.pending}
          onPress={refresh}
          variant="secondary"
        >
          {state.pending ? "Refreshing…" : "Refresh records"}
        </Button>
      )}
    </div>
  );
}

function BudgetFields({
  draft,
  categories,
  errors,
  disabled,
  editing,
  latestIncomeDate,
  onChange,
  finance,
}: {
  draft: Draft;
  categories: FinanceSnapshot["categories"];
  errors: FormErrors;
  disabled: boolean;
  editing: boolean;
  latestIncomeDate?: string;
  onChange: (patch: Partial<Draft>) => void;
  finance: FinanceManagerProps;
}) {
  const [creatingCategory, setCreatingCategory] = useState(false);
  const fields = [
    { name: "name", label: "Budget name", type: "text", maxLength: 100 },
    { name: "amount", label: "Limit in rupiah", type: "text", maxLength: 20, inputMode: "numeric" },
    { name: "startsOn", label: "Period starts on", type: "date" },
    {
      name: "warningPercent",
      label: "Warning at (%)",
      type: "text",
      maxLength: 3,
      inputMode: "numeric",
    },
  ] as const;
  return (
    <>
      <Select
        className="w-full"
        isDisabled={disabled}
        isInvalid={Boolean(errors.categoryId)}
        name="categoryId"
        onChange={(key) => {
          if (key === "__create_category__") setCreatingCategory(true);
          else onChange({ categoryId: key === null ? "" : String(key) });
        }}
        placeholder="Choose a category"
        value={draft.categoryId || null}
      >
        <Label>Category</Label>
        <Select.Trigger className="min-h-11">
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {categories
              .filter(
                (category) =>
                  (!category.isArchived || category.id === draft.categoryId) &&
                  !isExclusionCategoryName(category.name),
              )
              .map((category) => (
                <ListBox.Item
                  id={category.id}
                  isDisabled={category.isArchived}
                  key={category.id}
                  textValue={category.name}
                >
                  {category.name}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            <ListBox.Item id="__create_category__" textValue="Create new category">
              <Icon className="h-4 w-4" name="plus" />
              Create new category…
            </ListBox.Item>
          </ListBox>
        </Select.Popover>
        <FieldError>{errors.categoryId}</FieldError>
      </Select>
      {creatingCategory && (
        <CategoryCreator
          {...finance}
          onClose={() => setCreatingCategory(false)}
          onCreated={(category) => onChange({ categoryId: category.id })}
        />
      )}
      <fieldset className={styles.field} disabled={disabled}>
        <legend className={styles.label}>Period</legend>
        <div className="mt-1 flex gap-2">
          {(["monthly", "weekly"] as const).map((cadence) => (
            <Button
              aria-pressed={draft.cadence === cadence}
              className="min-h-11 flex-1 rounded-full"
              isDisabled={disabled}
              key={cadence}
              onPress={() => onChange({ cadence })}
              variant={draft.cadence === cadence ? "primary" : "secondary"}
            >
              {cadence === "monthly" ? "Monthly" : "Weekly"}
            </Button>
          ))}
        </div>
      </fieldset>
      {fields.map((field) => (
        <Fragment key={field.name}>
          <TextField
            className={styles.field}
            isDisabled={disabled}
            isInvalid={Boolean(errors[field.name])}
            name={field.name}
            onChange={(value) => onChange({ [field.name]: value })}
            type={field.type}
            value={draft[field.name]}
          >
            <Label>{field.label}</Label>
            <Input
              className="min-h-11 text-base"
              inputMode={"inputMode" in field ? field.inputMode : undefined}
              maxLength={"maxLength" in field ? field.maxLength : undefined}
            />
            <FieldError>{errors[field.name]}</FieldError>
            {field.name === "startsOn" && (
              <>
                <p className={styles.meta}>
                  {draft.cadence === "monthly"
                    ? "Resets on this day each month, or the last day of a shorter month."
                    : "Resets every seven days from this date."}
                </p>
                {latestIncomeDate && (
                  <Button
                    className="min-h-11 justify-start rounded-full text-xs"
                    isDisabled={disabled}
                    onPress={() => onChange({ startsOn: latestIncomeDate })}
                    variant="ghost"
                  >
                    <Icon className="h-4 w-4" name="income" />
                    Use last income · {formatDay(latestIncomeDate)}
                  </Button>
                )}
              </>
            )}
          </TextField>
          {field.name === "amount" && draft.categoryId && (
            <BudgetSuggestionPanel
              cadence={draft.cadence}
              categoryId={draft.categoryId}
              disabled={disabled}
              key={`${draft.categoryId}:${draft.cadence}`}
              onAccept={(amount) => onChange({ amount })}
            />
          )}
        </Fragment>
      ))}
      {draft.cadence === "weekly" && (
        <p className={styles.meta}>Each week runs for seven days from your start date.</p>
      )}
      {editing && (
        <Switch
          className="min-h-11"
          isDisabled={disabled}
          isSelected={draft.isActive}
          onChange={(isActive) => onChange({ isActive })}
        >
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Content>
          <Label>Active budget</Label>
        </Switch>
      )}
    </>
  );
}

function prepareBudgetRequest(
  draft: Draft,
  budget: Budget | undefined,
  snapshot: FinanceSnapshot,
): { request: BudgetRequest } | { errors: FormErrors } {
  const categoryError = budgetCategoryError(snapshot.categories, draft.categoryId);
  if (categoryError) return { errors: { categoryId: categoryError } };
  let amount: number | null;
  try {
    amount = parseDraftAmount(draft.amount);
  } catch (error) {
    if (!(error instanceof FinancePresentationError)) throw error;
    return { errors: { amount: error.message } };
  }
  const values = {
    name: draft.name.trim(),
    categoryId: draft.categoryId,
    cadence: draft.cadence,
    limit: { amountMinor: amount === null ? "" : String(amount), currency: "IDR" },
    startsOn: draft.startsOn,
    warningPercent: /^\d+$/.test(draft.warningPercent) ? Number(draft.warningPercent) : Number.NaN,
  };
  const parsed = budget
    ? updateBudgetInputSchema.safeParse({
        budgetId: budget.id,
        expectedUpdatedAt: budget.updatedAt,
        changes: { ...values, isActive: draft.isActive },
      })
    : createBudgetInputSchema.safeParse({ ...values, clientRequestId: "preflight" });
  if (!parsed.success) return { errors: formErrors(parsed.error.issues) };
  return {
    request: {
      operation: budget ? "edit_budget" : "create_budget",
      input: budget ? parsed.data : { ...parsed.data, clientRequestId: crypto.randomUUID() },
      values: { ...draft, name: values.name, amount: values.limit.amountMinor },
      priorIds: new Set(snapshot.allBudgets.map((item) => item.id)),
    },
  };
}

function findSubmittedBudget(
  snapshot: FinanceSnapshot,
  request: BudgetRequest,
  original: Budget | undefined,
) {
  return snapshot.allBudgets.find(
    (item) =>
      (original
        ? item.id === original.id && item.updatedAt !== original.updatedAt
        : !request.priorIds.has(item.id)) &&
      item.deletedAt === null &&
      item.name === request.values.name &&
      item.categoryId === request.values.categoryId &&
      item.cadence === request.values.cadence &&
      item.limit.amountMinor === request.values.amount &&
      item.startsOn === request.values.startsOn &&
      item.warningPercent === Number(request.values.warningPercent) &&
      item.isActive === request.values.isActive,
  );
}

type BudgetEditorProps = FinanceManagerProps & {
  budget?: Budget;
  onClose: () => void;
  onSaved?: (result: BudgetMutationResult) => void;
};

function useBudgetEditorState({ budget, onClose, onSaved, ...props }: BudgetEditorProps) {
  const [original, setOriginal] = useState(budget);
  const [state, setState] = useState(() => ({
    draft: draftOf(budget, props.snapshot.today),
    errors: {} as FormErrors,
    pending: false,
    error: null as string | null,
    uncertain: false,
    conflict: false,
    discard: false,
  }));
  const [initial, setInitial] = useState(state.draft);
  const request = useRef<BudgetRequest | null>(null);
  const [conflictSnapshot, setConflictSnapshot] = useState<FinanceSnapshot | null>(null);
  const inFlight = useRef(false);
  const latest = original
    ? props.snapshot.allBudgets.find((item) => item.id === original.id && item.deletedAt === null)
    : undefined;
  const unavailable = Boolean(original && !latest);
  const changed = Boolean(latest && latest.updatedAt !== original?.updatedAt);
  const needsReview = state.conflict || changed;
  const locked =
    state.pending ||
    state.uncertain ||
    Boolean(props.refreshRequired) ||
    needsReview ||
    unavailable;
  const draft = state.draft;
  const dirty = Object.keys(draft).some(
    (key) => draft[key as keyof Draft] !== initial[key as keyof Draft],
  );
  const close = () => {
    if (inFlight.current) return;
    if (state.discard) setState((previous) => ({ ...previous, discard: false }));
    else if (dirty && !state.uncertain) setState((previous) => ({ ...previous, discard: true }));
    else onClose();
  };
  const change = (patch: Partial<Draft>) =>
    setState((previous) => ({ ...previous, draft: { ...previous.draft, ...patch }, errors: {} }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || props.refreshRequired || needsReview || unavailable) return;
    if (!request.current) {
      const prepared = prepareBudgetRequest(draft, original, props.snapshot);
      if ("errors" in prepared) {
        setState((previous) => ({
          ...previous,
          errors: prepared.errors,
          error: "Check the marked fields.",
        }));
        const form = event.currentTarget;
        requestAnimationFrame(() =>
          form.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus(),
        );
        return;
      }
      request.current = prepared.request;
    }
    const submitted = request.current;
    inFlight.current = true;
    setState((previous) => ({ ...previous, pending: true, error: null, errors: {} }));
    try {
      const result = await props.runMutation(() =>
        callFinanceOperation(submitted.operation, submitted.input),
      );
      onSaved?.(result);
      onClose();
    } catch (error) {
      const uncertain = error instanceof FinanceClientError && error.actionMayHaveCompleted;
      const conflict =
        error instanceof FinanceClientError && error.code === "CONFLICT" && Boolean(original);
      if (conflict) setConflictSnapshot(props.snapshot);
      if (!uncertain && !state.uncertain) request.current = null;
      setState((previous) => ({
        ...previous,
        pending: false,
        uncertain: previous.uncertain || uncertain,
        conflict,
        error:
          error instanceof FinanceClientError
            ? error.message
            : "Your changes could not be verified. Refresh your records.",
      }));
    } finally {
      inFlight.current = false;
    }
  };
  const submitted = request.current;
  const found =
    state.uncertain && submitted
      ? findSubmittedBudget(props.snapshot, submitted, original)
      : undefined;
  const reviewLatest = () => {
    if (!latest || inFlight.current) return;
    const latestDraft = draftOf(latest, props.snapshot.today);
    setOriginal(latest);
    request.current = null;
    const merged = rebaseBudgetDraft(draft, initial, latestDraft);
    setInitial(latestDraft);
    setState((previous) => ({
      ...previous,
      draft: merged,
      errors: {},
      error: null,
      uncertain: false,
      conflict: false,
    }));
  };
  return {
    state,
    draft,
    close,
    change,
    submit,
    locked,
    found,
    latest,
    unavailable,
    needsReview,
    canReview: Boolean(latest && (changed || props.snapshot !== conflictSnapshot)),
    reviewLatest,
    useDraftForNewBudget: () => {
      setOriginal(undefined);
      setInitial(draftOf(undefined, props.snapshot.today));
      request.current = null;
      setState((previous) => ({ ...previous, error: null, uncertain: false, conflict: false }));
    },
    editing: Boolean(original),
    keepEditing: () => setState((previous) => ({ ...previous, discard: false })),
  };
}

function BudgetVersionRecovery({
  editor,
  onRefreshRecords,
}: {
  editor: ReturnType<typeof useBudgetEditorState>;
  onRefreshRecords?: () => Promise<void>;
}) {
  const { formatRupiah } = useAmountDisplay();
  if (editor.unavailable)
    return (
      <div className={styles.recovery} role="status">
        <p className="text-sm leading-6">
          This budget was removed. Your draft is still here. You can use it to start a new budget.
        </p>
        <Button className="min-h-11" onPress={editor.useDraftForNewBudget} variant="secondary">
          Use draft for a new budget
        </Button>
      </div>
    );
  if (!editor.needsReview) return null;
  return (
    <div className={styles.recovery} role="status">
      <p className="text-sm leading-6">
        This budget changed while you were editing. Your draft is safe. Review the latest version
        before saving.
      </p>
      {editor.canReview && editor.latest ? (
        <>
          <p className="text-sm leading-6">
            Latest saved: {editor.latest.name} ·{" "}
            {formatRupiah(BigInt(editor.latest.limit.amountMinor))} · {editor.latest.cadence} ·{" "}
            {editor.latest.isActive ? "Active" : "Paused"}
          </p>
          <Button className="min-h-11" onPress={editor.reviewLatest} variant="secondary">
            Keep my edits and review
          </Button>
          <p className={styles.meta}>
            Your edited fields stay. Untouched fields use the latest values. Nothing saves until you
            choose Save budget.
          </p>
        </>
      ) : (
        <FinanceRecovery
          message="Refresh your records to see what changed."
          onRefreshRecords={onRefreshRecords}
        />
      )}
    </div>
  );
}

function BudgetEditorFields({
  props,
  editor,
}: {
  props: BudgetEditorProps;
  editor: ReturnType<typeof useBudgetEditorState>;
}) {
  const { state, draft, close, change, locked, editing } = editor;
  return (
    <>
      <BudgetFields
        finance={props}
        categories={props.snapshot.categories}
        disabled={locked}
        draft={draft}
        editing={editing}
        latestIncomeDate={
          props.snapshot.transactions
            .filter(
              (transaction) =>
                transaction.status === "confirmed" &&
                transaction.kind === "income" &&
                transaction.date !== null &&
                transaction.date <= props.snapshot.today,
            )
            .map((transaction) => transaction.date)
            .sort()
            .at(-1) ?? undefined
        }
        errors={state.errors}
        onChange={change}
      />
      {state.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      <BudgetVersionRecovery editor={editor} onRefreshRecords={props.onRefreshRecords} />
      {!editor.needsReview && !editor.unavailable && (props.refreshRequired || state.uncertain) && (
        <FinanceRecovery
          message="We couldn’t confirm whether this saved. Your draft is safe. Refresh your records first; any retry uses the same submitted change."
          onRefreshRecords={props.onRefreshRecords}
        />
      )}
      <div className={styles.footer}>
        <Button className="min-h-11" isDisabled={state.pending} onPress={close} variant="secondary">
          Cancel
        </Button>
        <Button
          className="min-h-11"
          isDisabled={
            state.pending ||
            Boolean(props.refreshRequired) ||
            editor.needsReview ||
            editor.unavailable
          }
          type="submit"
        >
          {state.pending ? "Saving…" : state.uncertain ? "Retry same change" : "Save budget"}
        </Button>
      </div>
    </>
  );
}

function BudgetEditor(props: BudgetEditorProps) {
  const editor = useBudgetEditorState(props);
  const { state, close, submit, found, editing, keepEditing } = editor;
  const { onClose } = props;
  return (
    <ModalDialog labelledBy="budget-editor-title" onClose={close}>
      <form className={styles.form} noValidate onSubmit={submit} aria-busy={state.pending}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold" id="budget-editor-title">
            {state.discard ? "Discard changes?" : editing ? "Edit budget" : "New budget"}
          </h2>
          <Button
            aria-label="Close budget form"
            isDisabled={state.pending}
            isIconOnly
            onPress={close}
            variant="ghost"
          >
            <Icon name="close" />
          </Button>
        </div>
        {state.discard ? (
          <>
            <p className="text-sm text-muted">Your entries have not been saved.</p>
            <div className={styles.footer}>
              <Button onPress={onClose} variant="secondary">
                Discard changes
              </Button>
              <Button autoFocus onPress={keepEditing}>
                Keep editing
              </Button>
            </div>
          </>
        ) : found ? (
          <>
            <p className="text-sm leading-6" role="status">
              This budget now appears in your records.
            </p>
            <Button className="min-h-11" onPress={onClose}>
              Done
            </Button>
          </>
        ) : (
          <BudgetEditorFields editor={editor} props={props} />
        )}
      </form>
    </ModalDialog>
  );
}

function BudgetDelete({
  budget,
  onClose,
  ...props
}: FinanceManagerProps & { budget: Budget; onClose: () => void }) {
  const { formatRupiah } = useAmountDisplay();
  const [original, setOriginal] = useState(budget);
  const inFlight = useRef(false);
  const [state, setState] = useState({
    pending: false,
    conflict: false,
    error: null as string | null,
  });
  const [failedSnapshot, setFailedSnapshot] = useState<FinanceSnapshot | null>(null);
  const latest = props.snapshot.allBudgets.find(
    (item) => item.id === original.id && item.deletedAt === null,
  );
  const changed = Boolean(latest && latest.updatedAt !== original.updatedAt);
  const needsReview = changed || state.conflict;
  const remove = async () => {
    if (inFlight.current || props.refreshRequired || needsReview || !latest) return;
    inFlight.current = true;
    setState({ pending: true, conflict: false, error: null });
    try {
      await props.runMutation(() =>
        callFinanceOperation("delete_budget", {
          budgetId: original.id,
          expectedUpdatedAt: original.updatedAt,
        }),
      );
      onClose();
    } catch (error) {
      const conflict = error instanceof FinanceClientError && error.code === "CONFLICT";
      if (conflict) setFailedSnapshot(props.snapshot);
      setState({
        pending: false,
        conflict,
        error:
          error instanceof FinanceClientError
            ? error.message
            : "Deletion could not be verified. Refresh your records.",
      });
    } finally {
      inFlight.current = false;
    }
  };
  if (!latest)
    return (
      <ModalDialog labelledBy="budget-delete-title" onClose={onClose}>
        <div className={styles.form}>
          <h2 className="text-xl font-bold" id="budget-delete-title">
            Budget already removed
          </h2>
          <p className="text-sm leading-6 text-muted">
            This spending limit is no longer active. Your transactions are still in your history.
          </p>
          <Button className="min-h-11" onPress={onClose}>
            Back to budgets
          </Button>
        </div>
      </ModalDialog>
    );
  return (
    <ModalDialog
      labelledBy="budget-delete-title"
      onClose={() => {
        if (!inFlight.current) onClose();
      }}
    >
      <div className={styles.form} aria-busy={state.pending}>
        <h2 className="text-xl font-bold" id="budget-delete-title">
          Delete budget?
        </h2>
        <p className="break-words font-semibold">
          {original.name} · {formatRupiah(BigInt(original.limit.amountMinor))}
        </p>
        <p className="text-sm leading-6 text-muted">
          This permanently removes the spending limit and its budget progress. Your transactions
          stay in your history. To take a break instead, edit this budget and turn off Active
          budget.
        </p>
        {state.error && (
          <p className={styles.error} role="alert">
            {state.error}
          </p>
        )}
        {props.refreshRequired && (
          <FinanceRecovery
            message="Refresh your records to check the deletion result."
            onRefreshRecords={props.onRefreshRecords}
          />
        )}
        {needsReview && (
          <div className={styles.recovery} role="status">
            <p className="text-sm leading-6">
              This budget changed. Review its latest settings before deleting it.
            </p>
            {changed || props.snapshot !== failedSnapshot ? (
              <>
                <p className="text-sm leading-6">
                  Latest saved: {latest.name} · {formatRupiah(BigInt(latest.limit.amountMinor))} ·{" "}
                  {latest.cadence}
                </p>
                <Button
                  className="min-h-11"
                  variant="secondary"
                  onPress={() => {
                    setOriginal(latest);
                    setState({ pending: false, conflict: false, error: null });
                  }}
                >
                  Review this version
                </Button>
              </>
            ) : (
              <FinanceRecovery
                message="Refresh to see the latest budget."
                onRefreshRecords={props.onRefreshRecords}
              />
            )}
          </div>
        )}
        <div className={styles.footer}>
          <Button autoFocus isDisabled={state.pending} onPress={onClose} variant="secondary">
            Keep budget
          </Button>
          <Button
            isDisabled={state.pending || Boolean(props.refreshRequired) || needsReview}
            onPress={remove}
            variant="danger"
          >
            {state.pending ? "Deleting…" : "Delete budget"}
          </Button>
        </div>
      </div>
    </ModalDialog>
  );
}

function BudgetProgress({ usage }: { usage: BudgetUsage }) {
  const { formatRupiah } = useAmountDisplay();
  const used = BigInt(usage.used.amountMinor);
  const limit = BigInt(usage.budget.limit.amountMinor);
  const remaining = BigInt(usage.remaining.amountMinor);
  const hundredths = (used * 10000n) / limit;
  const percent = `${hundredths / 100n}${hundredths % 100n === 0n ? "" : `.${String(hundredths % 100n).padStart(2, "0")}`}`;
  const status =
    used > limit
      ? "Over budget"
      : used === limit
        ? "At limit"
        : used * 100n >= limit * BigInt(usage.budget.warningPercent)
          ? "Near limit"
          : "On track";
  return (
    <div className="mt-3">
      <div className={styles.row}>
        <span className={styles.meta}>
          {formatDay(usage.periodStartsOn)} – {formatDay(usage.periodEndsOn)}
        </span>
        <span className={`text-xs font-semibold ${used > limit ? "text-danger" : "text-muted"}`}>
          {status}
        </span>
      </div>
      <ProgressBar
        aria-label={`${usage.budget.name} budget used`}
        aria-valuetext={`${percent}% used; ${formatRupiah(used)} of ${formatRupiah(limit)}`}
        className="mt-2"
        value={Number(hundredths > 10000n ? 10000n : hundredths) / 100}
      >
        <ProgressBar.Track className="h-2 bg-surface-tertiary">
          <ProgressBar.Fill className={used > limit ? "bg-danger" : "bg-accent"} />
        </ProgressBar.Track>
      </ProgressBar>
      <div className={`${styles.row} mt-2`}>
        <span className={styles.meta}>
          {formatRupiah(used)} spent · {percent}%
        </span>
        <span className={`text-sm font-bold tabular-nums ${remaining < 0n ? "text-danger" : ""}`}>
          {formatRupiah(remaining < 0n ? -remaining : remaining)} {remaining < 0n ? "over" : "left"}
        </span>
      </div>
    </div>
  );
}

function useBudgetUsage(snapshot: FinanceSnapshot) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    snapshot: FinanceSnapshot;
    attempt: number;
    items: BudgetUsage[];
    error: string | null;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void callFinanceOperation("list_budget_usage", { month: snapshot.month }).then(
      (items) => {
        if (!cancelled) setResult({ snapshot, attempt, items, error: null });
      },
      (error: unknown) => {
        if (!cancelled)
          setResult({
            snapshot,
            attempt,
            items: [],
            error:
              error instanceof FinanceClientError
                ? error.message
                : "Budget usage could not be loaded.",
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [snapshot, attempt]);
  const loaded = result?.snapshot === snapshot && result.attempt === attempt;
  return {
    items: loaded ? result.items : [],
    loading: !loaded,
    error: loaded ? result.error : null,
    retry: () => setAttempt((previous) => previous + 1),
  };
}

export type BudgetManagerPanel =
  | { kind: "create" }
  | { kind: "edit" | "delete"; id: string }
  | null;

type BudgetManagerProps = FinanceManagerProps & {
  panel?: BudgetManagerPanel;
  onPanelChange?: (panel: BudgetManagerPanel) => void;
  collapseList?: boolean;
  hiddenBudgetIds?: readonly string[];
};

function BudgetListContainer({
  children,
  count,
  collapsed,
}: {
  children: ReactNode;
  count: number;
  collapsed?: boolean;
}) {
  if (!collapsed) return children;
  return (
    <details className="min-w-0">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        Other budgets · {count}
        <Icon className="h-4 w-4 shrink-0" name="chevron-down" />
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function ownedBudgetDetails(
  budget: Budget,
  category: string,
  usage: BudgetUsage | undefined,
  today: string,
  icon?: string,
): BudgetDetailsRecord {
  const base = {
    name: budget.name,
    category,
    icon,
    cadence: budget.cadence,
    limit: BigInt(budget.limit.amountMinor),
    warningPercent: budget.warningPercent,
    startsOn: budget.startsOn,
  };
  if (!budget.isActive) return { ...base, status: "Paused" };
  if (!usage)
    return { ...base, status: budget.startsOn > today ? "Not started" : "Progress unavailable" };
  const used = BigInt(usage.used.amountMinor);
  const status =
    used > base.limit
      ? "Over budget"
      : used === base.limit
        ? "At limit"
        : usage.state === "warning"
          ? "Near limit"
          : "On track";
  return {
    ...base,
    status,
    usage: {
      used,
      remaining: BigInt(usage.remaining.amountMinor),
      periodStartsOn: usage.periodStartsOn,
      periodEndsOn: usage.periodEndsOn,
    },
  };
}

function ManagedBudgetRow({
  budget,
  category,
  progress,
  today,
  onOpen,
  icon,
}: {
  budget: Budget;
  category: string;
  progress?: BudgetUsage;
  today: string;
  onOpen: () => void;
  icon?: string;
}) {
  const { formatRupiah } = useAmountDisplay();
  return (
    <li>
      <Button
        aria-label={`View ${budget.name} budget details`}
        className={styles.managedRow}
        onPress={onOpen}
        variant="ghost"
      >
        <div className={styles.row}>
          <h3 className={`${styles.name} flex items-center gap-3`}>
            <CategoryAvatar
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-foreground"
              icon={icon}
              iconClassName="h-5 w-5"
              name={category}
            />
            {budget.name}
          </h3>
          <strong className={styles.amount}>
            {formatRupiah(BigInt(budget.limit.amountMinor))}
          </strong>
        </div>
        <p className={styles.meta}>
          {category} · {budget.cadence === "weekly" ? "Weekly" : "Monthly"}
          {budget.isActive ? "" : " · Paused"}
        </p>
        {progress ? (
          <BudgetProgress usage={progress} />
        ) : budget.isActive && budget.startsOn > today ? (
          <p className={styles.meta}>Starts {formatDay(budget.startsOn)}</p>
        ) : null}
        <div className="mt-3 flex justify-end">
          <Icon className="h-4 w-4 text-muted" name="chevron-right" />
        </div>
      </Button>
    </li>
  );
}

function BudgetManagerDialog({
  panel,
  budget,
  onClose,
  ...props
}: FinanceManagerProps & {
  panel: BudgetManagerPanel;
  budget?: Budget;
  onClose: () => void;
  onSaved?: (result: BudgetMutationResult) => void;
}) {
  const [openedBudget] = useState(budget);
  if (!panel) return null;
  if (panel.kind === "create") return <BudgetEditor {...props} onClose={onClose} />;
  if (!openedBudget)
    return (
      <ModalDialog labelledBy="budget-unavailable-title" onClose={onClose}>
        <div className={styles.form}>
          <h2 className="text-xl font-bold" id="budget-unavailable-title">
            Budget unavailable
          </h2>
          <p className="text-sm text-muted">
            This budget may have been removed elsewhere. Your transactions are safe. Return to
            Budgets to choose another limit.
          </p>
          <Button onPress={onClose}>Back to budgets</Button>
        </div>
      </ModalDialog>
    );
  if (panel.kind === "edit")
    return (
      <BudgetEditor {...props} budget={openedBudget} key={openedBudget.id} onClose={onClose} />
    );
  return <BudgetDelete {...props} budget={openedBudget} key={openedBudget.id} onClose={onClose} />;
}

function BudgetSavedNotice({
  result,
  finance,
  onDismiss,
  onView,
}: {
  result: BudgetMutationResult;
  finance: FinanceManagerProps;
  onDismiss: () => void;
  onView?: () => void;
}) {
  const [state, setState] = useState({
    pending: false,
    undone: false,
    unavailable: false,
    error: null as string | null,
  });
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    noticeRef.current?.scrollIntoView({ block: "center" });
    noticeRef.current?.focus({ preventScroll: true });
  }, []);
  const inFlight = useRef(false);
  const undo = async () => {
    if (inFlight.current || finance.refreshRequired || state.undone || state.unavailable) return;
    if (Date.parse(result.action.undoExpiresAt) <= Date.now()) {
      setState((previous) => ({
        ...previous,
        unavailable: true,
        error: "The undo window has ended. Open this budget to make a new change.",
      }));
      return;
    }
    inFlight.current = true;
    setState((previous) => ({ ...previous, pending: true, error: null }));
    try {
      await finance.runMutation(() =>
        callFinanceOperation("undo_action", { actionId: result.action.actionId }),
      );
      setState({ pending: false, undone: true, unavailable: false, error: null });
    } catch (error) {
      const conflict = error instanceof FinanceClientError && error.code === "CONFLICT";
      setState({
        pending: false,
        undone: false,
        unavailable: conflict,
        error: conflict
          ? "This budget changed again or its undo window ended. Refresh your records and review its latest details."
          : error instanceof FinanceClientError && !error.actionMayHaveCompleted
            ? error.message
            : "We couldn’t confirm the undo. Refresh your records before trying again.",
      });
    } finally {
      inFlight.current = false;
    }
  };
  return (
    <div
      className={`${styles.recovery} mb-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
      ref={noticeRef}
      role="status"
      tabIndex={-1}
    >
      <p className="text-sm leading-6">
        {state.undone
          ? "Budget change undone. Your transactions haven’t changed."
          : `${result.budget.name} saved. Its progress now uses these settings.`}
      </p>
      {!state.undone && !state.unavailable && (
        <p className={styles.meta}>
          Undo is available for a short time, unless this budget changes again.
        </p>
      )}
      {state.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      {(finance.refreshRequired || state.error) && (
        <FinanceRecovery
          message="Refresh to check your latest budget settings."
          onRefreshRecords={finance.onRefreshRecords}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {!state.undone && (
          <Button
            className="min-h-11"
            isDisabled={state.pending || state.unavailable || Boolean(finance.refreshRequired)}
            onPress={undo}
            variant="secondary"
          >
            {state.pending ? "Undoing…" : "Undo change"}
          </Button>
        )}
        {onView && (
          <Button className="min-h-11" isDisabled={state.pending} onPress={onView} variant="ghost">
            View budget
          </Button>
        )}
        <Button className="min-h-11" isDisabled={state.pending} onPress={onDismiss} variant="ghost">
          Dismiss
        </Button>
      </div>
    </div>
  );
}

function ManagedBudgetList({
  budgets,
  categories,
  usage,
  collapsed,
  today,
  onOpen,
}: {
  budgets: Budget[];
  categories: FinanceSnapshot["categories"];
  usage: ReturnType<typeof useBudgetUsage>;
  collapsed?: boolean;
  today: string;
  onOpen: (budgetId: string) => void;
}) {
  return (
    <>
      {budgets.length > 0 ? (
        <div className={styles.header}>
          <h2 className="text-base font-bold" id="manage-budgets-title">
            Manage budgets
          </h2>
        </div>
      ) : null}
      {usage.loading && (
        <p className={styles.meta} role="status">
          Loading budget progress…
        </p>
      )}
      {usage.error && (
        <div className="mb-3">
          <p className={styles.error} role="alert">
            {usage.error}
          </p>
          <Button className="mt-2 min-h-11" onPress={usage.retry} variant="secondary">
            Try again
          </Button>
        </div>
      )}
      {budgets.length > 0 && (
        <BudgetListContainer collapsed={collapsed} count={budgets.length}>
          <ul className={styles.list}>
            {budgets.map((budget) => {
              const progress = usage.items.find(
                (item) =>
                  item.budget.id === budget.id && item.budget.updatedAt === budget.updatedAt,
              );
              const category = categories.find((item) => item.id === budget.categoryId);
              return (
                <ManagedBudgetRow
                  budget={budget}
                  category={category?.name ?? "Category unavailable"}
                  icon={category?.icon}
                  key={budget.id}
                  progress={progress}
                  today={today}
                  onOpen={() => onOpen(budget.id)}
                />
              );
            })}
          </ul>
        </BudgetListContainer>
      )}
    </>
  );
}

function ManagedBudgetDetails({
  budget,
  snapshot,
  usage,
  onClose,
  onPanelChange,
}: {
  budget: Budget;
  snapshot: FinanceSnapshot;
  usage: ReturnType<typeof useBudgetUsage>;
  onClose: () => void;
  onPanelChange: (panel: BudgetManagerPanel) => void;
}) {
  const category = snapshot.categories.find((item) => item.id === budget.categoryId);
  const progress = usage.items.find(
    (item) => item.budget.id === budget.id && item.budget.updatedAt === budget.updatedAt,
  );
  return (
    <BudgetDetails
      record={ownedBudgetDetails(
        budget,
        category?.name ?? "Category unavailable",
        progress,
        snapshot.today,
        category?.icon,
      )}
      onClose={onClose}
      onEdit={() => {
        onClose();
        onPanelChange({ kind: "edit", id: budget.id });
      }}
      onDelete={() => {
        onClose();
        onPanelChange({ kind: "delete", id: budget.id });
      }}
    />
  );
}

export function BudgetManager(props: BudgetManagerProps) {
  const [localPanel, setLocalPanel] = useState<BudgetManagerPanel>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [saved, setSaved] = useState<BudgetMutationResult | null>(null);
  const panel = props.onPanelChange ? (props.panel ?? null) : localPanel;
  const setPanel = props.onPanelChange ?? setLocalPanel;
  const usage = useBudgetUsage(props.snapshot);
  const budgets = props.snapshot.allBudgets.filter((budget) => budget.deletedAt === null);
  const hiddenBudgetIds = new Set(props.hiddenBudgetIds);
  const listedBudgets = budgets.filter((budget) => !hiddenBudgetIds.has(budget.id));
  const detail = budgets.find((budget) => budget.id === detailId);
  const selected =
    panel && panel.kind !== "create" ? budgets.find((budget) => budget.id === panel.id) : undefined;
  const close = () => setPanel(null);
  return (
    <section aria-labelledby="manage-budgets-title" className={styles.manager}>
      {saved && (
        <BudgetSavedNotice
          key={saved.action.actionId}
          result={saved}
          finance={props}
          onDismiss={() => setSaved(null)}
          onView={
            budgets.some((budget) => budget.id === saved.budget.id)
              ? () => setDetailId(saved.budget.id)
              : undefined
          }
        />
      )}
      <ManagedBudgetList
        budgets={listedBudgets}
        categories={props.snapshot.categories}
        usage={usage}
        collapsed={props.collapseList}
        today={props.snapshot.today}
        onOpen={setDetailId}
      />
      {detail && (
        <ManagedBudgetDetails
          budget={detail}
          snapshot={props.snapshot}
          usage={usage}
          onClose={() => setDetailId(null)}
          onPanelChange={setPanel}
        />
      )}
      <BudgetManagerDialog
        {...props}
        key={panel?.kind === "create" ? "create" : panel ? `${panel.kind}:${panel.id}` : "closed"}
        panel={panel}
        budget={selected}
        onClose={close}
        onSaved={setSaved}
      />
    </section>
  );
}
