"use client";

import {
  type Budget,
  type BudgetUsage,
  type CreateBudgetInput,
  createBudgetInputSchema,
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

type Draft = {
  name: string;
  categoryId: string;
  cadence: "weekly" | "monthly";
  amount: string;
  startsOn: string;
  warningPercent: string;
  isActive: boolean;
};
type FormErrors = Partial<Record<keyof Draft, string>>;
type BudgetRequest = {
  operation: "create_budget" | "edit_budget";
  input: CreateBudgetInput | UpdateBudgetInput;
  values: Draft;
  priorIds: Set<string>;
};

function draftOf(budget: Budget | undefined, today: string): Draft {
  return {
    name: budget?.name ?? "",
    categoryId: budget?.categoryId ?? "",
    cadence: budget?.cadence ?? "monthly",
    amount: budget?.limit.amountMinor ?? "",
    startsOn: budget?.startsOn ?? today,
    warningPercent: String(budget?.warningPercent ?? 80),
    isActive: budget?.isActive ?? true,
  };
}

function formErrors(issues: { path: readonly PropertyKey[]; message: string }[]): FormErrors {
  const errors: FormErrors = {};
  for (const issue of issues) {
    const key = issue.path[0] === "changes" ? issue.path[1] : issue.path[0];
    const field = key === "limit" ? "amount" : key;
    if (typeof field === "string") errors[field as keyof Draft] ??= issue.message;
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
              .filter((category) => !category.isArchived || category.id === draft.categoryId)
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

type BudgetEditorProps = FinanceManagerProps & { budget?: Budget; onClose: () => void };

function useBudgetEditorState({ budget, onClose, ...props }: BudgetEditorProps) {
  const original = useRef(budget);
  const [state, setState] = useState(() => ({
    draft: draftOf(budget, props.snapshot.today),
    errors: {} as FormErrors,
    pending: false,
    error: null as string | null,
    uncertain: false,
    discard: false,
  }));
  const initial = useRef(state.draft);
  const request = useRef<BudgetRequest | null>(null);
  const inFlight = useRef(false);
  const locked = state.pending || state.uncertain || Boolean(props.refreshRequired);
  const draft = state.draft;
  const dirty = Object.keys(draft).some(
    (key) => draft[key as keyof Draft] !== initial.current[key as keyof Draft],
  );
  const close = () => {
    if (inFlight.current) return;
    if (dirty && !state.discard && !state.uncertain)
      setState((previous) => ({ ...previous, discard: true }));
    else onClose();
  };
  const change = (patch: Partial<Draft>) =>
    setState((previous) => ({ ...previous, draft: { ...previous.draft, ...patch }, errors: {} }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || props.refreshRequired) return;
    if (!request.current) {
      const prepared = prepareBudgetRequest(draft, original.current, props.snapshot);
      if ("errors" in prepared) {
        setState((previous) => ({
          ...previous,
          errors: prepared.errors,
          error: "Check the marked fields.",
        }));
        return;
      }
      request.current = prepared.request;
    }
    const submitted = request.current;
    inFlight.current = true;
    setState((previous) => ({ ...previous, pending: true, error: null, errors: {} }));
    try {
      await props.runMutation(() => callFinanceOperation(submitted.operation, submitted.input));
      onClose();
    } catch (error) {
      const uncertain = error instanceof FinanceClientError && error.actionMayHaveCompleted;
      if (!uncertain && !state.uncertain) request.current = null;
      setState((previous) => ({
        ...previous,
        pending: false,
        uncertain: previous.uncertain || uncertain,
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
      ? findSubmittedBudget(props.snapshot, submitted, original.current)
      : undefined;
  return {
    state,
    draft,
    close,
    change,
    submit,
    locked,
    found,
    editing: Boolean(original.current),
    keepEditing: () => setState((previous) => ({ ...previous, discard: false })),
  };
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
      {(props.refreshRequired || state.uncertain) && (
        <FinanceRecovery
          message="Check your records before retrying. A retry will use the same submitted values."
          onRefreshRecords={props.onRefreshRecords}
        />
      )}
      <div className={styles.footer}>
        <Button className="min-h-11" isDisabled={state.pending} onPress={close} variant="secondary">
          Cancel
        </Button>
        <Button
          className="min-h-11"
          isDisabled={state.pending || Boolean(props.refreshRequired)}
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
  const original = useRef(budget);
  const inFlight = useRef(false);
  const [state, setState] = useState({ pending: false, error: null as string | null });
  const remove = async () => {
    if (inFlight.current || props.refreshRequired) return;
    inFlight.current = true;
    setState({ pending: true, error: null });
    try {
      await props.runMutation(() =>
        callFinanceOperation("delete_budget", {
          budgetId: original.current.id,
          expectedUpdatedAt: original.current.updatedAt,
        }),
      );
      onClose();
    } catch (error) {
      setState({
        pending: false,
        error:
          error instanceof FinanceClientError
            ? error.message
            : "Deletion could not be verified. Refresh your records.",
      });
    } finally {
      inFlight.current = false;
    }
  };
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
          {budget.name} · {formatRupiah(BigInt(budget.limit.amountMinor))}
        </p>
        <p className="text-sm leading-6 text-muted">
          This removes its spending limit. Your transactions stay in your ledger.
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
        <div className={styles.footer}>
          <Button autoFocus isDisabled={state.pending} onPress={onClose} variant="secondary">
            Keep budget
          </Button>
          <Button
            isDisabled={state.pending || Boolean(props.refreshRequired)}
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
}: FinanceManagerProps & { panel: BudgetManagerPanel; budget?: Budget; onClose: () => void }) {
  if (!panel) return null;
  if (panel.kind === "create") return <BudgetEditor {...props} onClose={onClose} />;
  if (!budget)
    return (
      <ModalDialog labelledBy="budget-unavailable-title" onClose={onClose}>
        <div className={styles.form}>
          <h2 className="text-xl font-bold" id="budget-unavailable-title">
            Budget unavailable
          </h2>
          <p className="text-sm text-muted">This budget is no longer in your current records.</p>
          <Button onPress={onClose}>Close</Button>
        </div>
      </ModalDialog>
    );
  if (panel.kind === "edit")
    return <BudgetEditor {...props} budget={budget} key={budget.id} onClose={onClose} />;
  return <BudgetDelete {...props} budget={budget} key={budget.id} onClose={onClose} />;
}

export function BudgetManager(props: BudgetManagerProps) {
  const [localPanel, setLocalPanel] = useState<BudgetManagerPanel>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const panel = props.onPanelChange ? (props.panel ?? null) : localPanel;
  const setPanel = props.onPanelChange ?? setLocalPanel;
  const usage = useBudgetUsage(props.snapshot);
  const budgets = props.snapshot.allBudgets.filter((budget) => budget.deletedAt === null);
  const hiddenBudgetIds = new Set(props.hiddenBudgetIds);
  const listedBudgets = budgets.filter((budget) => !hiddenBudgetIds.has(budget.id));
  const detail = budgets.find((budget) => budget.id === detailId);
  const detailCategory =
    props.snapshot.categories.find((category) => category.id === detail?.categoryId)?.name ??
    "Category unavailable";
  const detailProgress = usage.items.find(
    (item) => item.budget.id === detail?.id && item.budget.updatedAt === detail?.updatedAt,
  );
  const selected =
    panel && panel.kind !== "create" ? budgets.find((budget) => budget.id === panel.id) : undefined;
  const close = () => setPanel(null);
  return (
    <section aria-labelledby="manage-budgets-title" className={styles.manager}>
      {listedBudgets.length > 0 ? (
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
      {listedBudgets.length > 0 && (
        <BudgetListContainer collapsed={props.collapseList} count={listedBudgets.length}>
          <ul className={styles.list}>
            {listedBudgets.map((budget) => {
              const progress = usage.items.find(
                (item) =>
                  item.budget.id === budget.id && item.budget.updatedAt === budget.updatedAt,
              );
              const category = props.snapshot.categories.find(
                (item) => item.id === budget.categoryId,
              );
              return (
                <ManagedBudgetRow
                  budget={budget}
                  category={category?.name ?? "Category unavailable"}
                  icon={category?.icon}
                  key={budget.id}
                  progress={progress}
                  today={props.snapshot.today}
                  onOpen={() => setDetailId(budget.id)}
                />
              );
            })}
          </ul>
        </BudgetListContainer>
      )}
      {detail && (
        <BudgetDetails
          record={ownedBudgetDetails(
            detail,
            detailCategory,
            detailProgress,
            props.snapshot.today,
            props.snapshot.categories.find((category) => category.id === detail.categoryId)?.icon,
          )}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            setDetailId(null);
            setPanel({ kind: "edit", id: detail.id });
          }}
          onDelete={() => {
            setDetailId(null);
            setPanel({ kind: "delete", id: detail.id });
          }}
        />
      )}
      <BudgetManagerDialog {...props} panel={panel} budget={selected} onClose={close} />
    </section>
  );
}
