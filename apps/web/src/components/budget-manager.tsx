"use client";

import {
  type Budget,
  type BudgetMutationResult,
  type BudgetUsage,
  createBudgetInputSchema,
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
import {
  type Dispatch,
  type FormEvent,
  Fragment,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAmountDisplay } from "@/components/app-session-context";
import { BudgetDetails, type BudgetDetailsRecord } from "@/components/budget-details";
import { useBudgetDraftSessions } from "@/components/budget-draft-session-context";
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
import {
  type BudgetDraftSession,
  type BudgetSaveRequest as BudgetRequest,
  budgetSessionKey,
} from "@/lib/finance/budget-session";
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
                  category.kind === "expense",
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
          initialKind="expense"
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
  initialCadence?: Budget["cadence"];
  onClose: () => void;
  onSaved?: (result: BudgetMutationResult) => void;
};

function retainedEditorState(
  recovered: BudgetDraftSession | undefined,
  budget: Budget | undefined,
  today: string,
  initialCadence?: Budget["cadence"],
) {
  return {
    draft: recovered?.draft ?? draftOf(budget, today, initialCadence),
    errors: {} as FormErrors,
    pending: recovered?.pending ?? false,
    error: recovered?.error ?? null,
    uncertain: recovered?.uncertain ?? false,
    conflict: recovered?.conflict ?? false,
    submittedRequest: recovered?.request ?? (null as BudgetRequest | null),
    discard: false,
  };
}

function budgetSaveFailure(error: unknown, editing: boolean, wasUncertain: boolean) {
  const known = error instanceof FinanceClientError;
  const uncertain = wasUncertain || !known || error.actionMayHaveCompleted;
  return {
    pending: false,
    uncertain,
    conflict: known && error.code === "CONFLICT" && editing,
    error: known
      ? error.message
      : "We couldn’t check this save. Your draft is here. Refresh to check your records.",
  };
}

function isDraftDirty(draft: Draft, initial: Draft): boolean {
  return Object.keys(draft).some(
    (key) => draft[key as keyof Draft] !== initial[key as keyof Draft],
  );
}

function inspectBudgetVersion(
  original: Budget | undefined,
  snapshot: FinanceSnapshot,
  conflictSnapshot: FinanceSnapshot | null,
  conflict: boolean,
) {
  const latest = original
    ? snapshot.allBudgets.find((item) => item.id === original.id && item.deletedAt === null)
    : undefined;
  const unavailable = Boolean(original && !latest);
  const changed = Boolean(latest && latest.updatedAt !== original?.updatedAt);
  const needsReview = conflict || changed;
  const canReview = Boolean(latest && (changed || snapshot !== conflictSnapshot));
  return { latest, unavailable, changed, needsReview, canReview };
}

function isEditorLocked({
  pending,
  uncertain,
  refreshRequired,
  needsReview,
  unavailable,
}: {
  pending: boolean;
  uncertain: boolean;
  refreshRequired?: boolean;
  needsReview: boolean;
  unavailable: boolean;
}) {
  return pending || uncertain || Boolean(refreshRequired) || needsReview || unavailable;
}

function useBudgetSessionSync({
  sessionKey,
  dirty,
  state,
  original,
  initial,
  requestRef,
  sessions,
  inFlightRef,
  onClose,
  setState,
}: {
  sessionKey: string;
  dirty: boolean;
  state: ReturnType<typeof retainedEditorState>;
  original: Budget | undefined;
  initial: Draft;
  requestRef: MutableRefObject<BudgetRequest | null>;
  sessions: ReturnType<typeof useBudgetDraftSessions>;
  inFlightRef: MutableRefObject<boolean>;
  onClose: () => void;
  setState: Dispatch<SetStateAction<ReturnType<typeof retainedEditorState>>>;
}) {
  const { keep, forget } = sessions;
  useEffect(() => {
    if (!dirty && !state.uncertain && !state.pending) {
      forget(sessionKey);
      return;
    }
    keep(sessionKey, {
      original,
      initial,
      draft: state.draft,
      request: requestRef.current,
      pending: state.pending,
      uncertain: state.uncertain,
      conflict: state.conflict,
      error: state.error,
    });
  }, [
    dirty,
    initial,
    original,
    state.draft,
    state.uncertain,
    state.pending,
    state.conflict,
    state.error,
    sessionKey,
    keep,
    forget,
    requestRef,
  ]);

  useEffect(() => {
    if (inFlightRef.current) return;
    const session = sessions.sessions[sessionKey];
    if (!session) {
      if (state.pending) onClose();
      return;
    }
    if (
      session.pending !== state.pending ||
      session.uncertain !== state.uncertain ||
      session.conflict !== state.conflict ||
      session.error !== state.error
    ) {
      if (session.request) requestRef.current = session.request;
      setState((previous) => ({
        ...previous,
        pending: session.pending,
        uncertain: session.uncertain,
        conflict: session.conflict,
        error: session.error,
        submittedRequest: session.request,
      }));
    }
  }, [
    sessions.sessions,
    sessionKey,
    state.pending,
    state.uncertain,
    state.conflict,
    state.error,
    inFlightRef,
    requestRef,
    setState,
    onClose,
  ]);
}

async function executeBudgetSubmission({
  event,
  draft,
  original,
  snapshot,
  state,
  requestRef,
  sessionKey,
  initial,
  runMutation,
  onSaved,
  finish,
  setConflictSnapshot,
  keep,
  setState,
}: {
  event: FormEvent<HTMLFormElement>;
  draft: Draft;
  original: Budget | undefined;
  snapshot: FinanceSnapshot;
  state: ReturnType<typeof retainedEditorState>;
  requestRef: MutableRefObject<BudgetRequest | null>;
  sessionKey: string;
  initial: Draft;
  runMutation: FinanceManagerProps["runMutation"];
  onSaved?: (result: BudgetMutationResult) => void;
  finish: () => void;
  setConflictSnapshot: (snapshot: FinanceSnapshot | null) => void;
  keep: (key: string, session: BudgetDraftSession) => void;
  setState: Dispatch<SetStateAction<ReturnType<typeof retainedEditorState>>>;
}) {
  if (!requestRef.current) {
    const prepared = prepareBudgetRequest(draft, original, snapshot);
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
    requestRef.current = prepared.request;
  }
  const submitted = requestRef.current;
  setState((previous) => ({
    ...previous,
    pending: true,
    error: null,
    errors: {},
    submittedRequest: submitted,
  }));
  keep(sessionKey, {
    original,
    initial,
    draft,
    request: submitted,
    pending: true,
    uncertain: state.uncertain,
    conflict: false,
    error: null,
  });
  try {
    const result = await runMutation(() =>
      callFinanceOperation(submitted.operation, submitted.input),
    );
    onSaved?.(result);
    finish();
  } catch (error) {
    const failure = budgetSaveFailure(error, Boolean(original), state.uncertain);
    if (failure.conflict) setConflictSnapshot(snapshot);
    if (!failure.uncertain) requestRef.current = null;
    keep(sessionKey, {
      original,
      initial,
      draft,
      request: requestRef.current,
      ...failure,
    });
    setState((previous) => ({
      ...previous,
      ...failure,
      submittedRequest: requestRef.current,
    }));
  }
}

function useBudgetEditorState({ budget, onClose, onSaved, ...props }: BudgetEditorProps) {
  const sessions = useBudgetDraftSessions();
  const [recovered] = useState(() => sessions.sessions[budgetSessionKey(budget?.id)]);
  const [original, setOriginal] = useState(recovered?.original ?? budget);
  const sessionKey = budgetSessionKey(original?.id);
  const [state, setState] = useState(() =>
    retainedEditorState(recovered, budget, props.snapshot.today, props.initialCadence),
  );
  const [initial, setInitial] = useState(recovered?.initial ?? state.draft);
  const request = useRef<BudgetRequest | null>(recovered?.request ?? null);
  const [conflictSnapshot, setConflictSnapshot] = useState<FinanceSnapshot | null>(null);
  const inFlight = useRef(false);

  const version = inspectBudgetVersion(original, props.snapshot, conflictSnapshot, state.conflict);
  const locked = isEditorLocked({
    pending: state.pending,
    uncertain: state.uncertain,
    refreshRequired: props.refreshRequired,
    needsReview: version.needsReview,
    unavailable: version.unavailable,
  });
  const draft = state.draft;
  const dirty = isDraftDirty(draft, initial);

  useBudgetSessionSync({
    sessionKey,
    dirty,
    state,
    original,
    initial,
    requestRef: request,
    sessions,
    inFlightRef: inFlight,
    onClose,
    setState,
  });

  const finish = () => {
    sessions.forget(sessionKey);
    onClose();
  };

  const close = () => {
    if (inFlight.current || state.pending) return;
    if (state.discard) setState((previous) => ({ ...previous, discard: false }));
    else if (dirty && !state.uncertain) setState((previous) => ({ ...previous, discard: true }));
    else onClose();
  };

  const change = (patch: Partial<Draft>) =>
    setState((previous) => ({ ...previous, draft: { ...previous.draft, ...patch }, errors: {} }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      inFlight.current ||
      state.pending ||
      props.refreshRequired ||
      version.needsReview ||
      version.unavailable
    )
      return;
    inFlight.current = true;
    try {
      await executeBudgetSubmission({
        event,
        draft,
        original,
        snapshot: props.snapshot,
        state,
        requestRef: request,
        sessionKey,
        initial,
        runMutation: props.runMutation,
        onSaved,
        finish,
        setConflictSnapshot,
        keep: sessions.keep,
        setState,
      });
    } finally {
      inFlight.current = false;
    }
  };

  const submitted = state.submittedRequest;
  const found =
    state.uncertain && submitted
      ? findSubmittedBudget(props.snapshot, submitted, original)
      : undefined;

  const reviewLatest = () => {
    if (!version.latest || inFlight.current) return;
    const latestDraft = draftOf(version.latest, props.snapshot.today);
    setOriginal(version.latest);
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
      submittedRequest: null,
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
    latest: version.latest,
    unavailable: version.unavailable,
    needsReview: version.needsReview,
    canReview: version.canReview,
    reviewLatest,
    useDraftForNewBudget: () => {
      sessions.forget(sessionKey);
      setOriginal(undefined);
      setInitial(draftOf(undefined, props.snapshot.today));
      request.current = null;
      setState((previous) => ({
        ...previous,
        error: null,
        uncertain: false,
        conflict: false,
        submittedRequest: null,
      }));
    },
    editing: Boolean(original),
    keepEditing: () => setState((previous) => ({ ...previous, discard: false })),
    finish,
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
          message="The save reply didn’t reach us. Check your records, then retry the same change if needed. Your entries are kept for this visit, even if you close this form."
          onRefreshRecords={props.onRefreshRecords}
        />
      )}
      <div className={styles.footer}>
        <Button className="min-h-11" isDisabled={state.pending} onPress={close} variant="secondary">
          {state.uncertain ? "Keep for later" : "Cancel"}
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
  const { state, close, submit, found, editing, keepEditing, finish } = editor;
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
              <Button onPress={finish} variant="secondary">
                Discard changes
              </Button>
              <Button autoFocus onPress={keepEditing}>
                Keep editing
              </Button>
            </div>
          </>
        ) : found && editing ? (
          <>
            <p className="text-sm leading-6" role="status">
              Your latest budget has these settings. Your changes are reflected in your records.
            </p>
            <Button className="min-h-11" onPress={finish}>
              Done
            </Button>
          </>
        ) : (
          <>
            {found && (
              <p className="rounded-xl bg-success-soft p-3 text-sm leading-6" role="status">
                A budget with these settings appears in your records. Retry the same change to
                verify this save safely.
              </p>
            )}
            <BudgetEditorFields editor={editor} props={props} />
          </>
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
  | { kind: "create"; cadence?: Budget["cadence"] }
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
  if (panel.kind === "create")
    return <BudgetEditor {...props} initialCadence={panel.cadence} onClose={onClose} />;
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
      const notSent = error instanceof FinanceClientError && !error.actionMayHaveCompleted;
      setState({
        pending: false,
        undone: false,
        unavailable: conflict,
        error: conflict
          ? "This budget changed again or its undo window ended. Refresh your records and review its latest details."
          : notSent
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

function retainedBudgetDialogKey(panel: BudgetManagerPanel) {
  if (!panel) return "closed";
  const id = panel.kind === "create" ? "new" : panel.id;
  return `${panel.kind}:${id}`;
}

function RetainedBudgetDrafts({ onResume }: { onResume: (panel: BudgetManagerPanel) => void }) {
  const { sessions } = useBudgetDraftSessions();
  return Object.entries(sessions).map(([key, draft]) => (
    <div
      className="mb-3 rounded-2xl border border-border bg-surface-secondary p-4"
      key={key}
      role="status"
    >
      <p className="text-sm font-semibold">
        {draft.pending
          ? "Saving your budget…"
          : draft.uncertain
            ? "Let’s check that budget save"
            : "Your budget draft is here"}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted">
        {draft.draft.name || "New budget"} · Kept for this visit.{" "}
        {draft.uncertain
          ? "Continue with the same save, without creating another."
          : "Pick up where you left off."}
      </p>
      <Button
        className="mt-2 min-h-11 rounded-full"
        isDisabled={draft.pending}
        onPress={() =>
          onResume(draft.original ? { kind: "edit", id: draft.original.id } : { kind: "create" })
        }
        variant="secondary"
      >
        {draft.uncertain ? "Check save" : "Resume draft"}
      </Button>
    </div>
  ));
}

export function BudgetManager(props: BudgetManagerProps) {
  const { sessions } = useBudgetDraftSessions();
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
    panel && panel.kind !== "create"
      ? (budgets.find((budget) => budget.id === panel.id) ??
        sessions[budgetSessionKey(panel.id)]?.original)
      : undefined;
  const close = () => setPanel(null);
  return (
    <section aria-labelledby="manage-budgets-title" className={styles.manager}>
      <RetainedBudgetDrafts onResume={setPanel} />
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
        key={retainedBudgetDialogKey(panel)}
        panel={panel}
        budget={selected}
        onClose={close}
        onSaved={setSaved}
      />
    </section>
  );
}
