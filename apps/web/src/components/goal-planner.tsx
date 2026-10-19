"use client";

import type { FinancialGoal } from "@monara/contracts";
import { Button, Card, ProgressBar } from "@monara/ui";
import Image from "next/image";
import { type FormEvent, useId, useMemo, useRef, useState } from "react";

import { useAmountDisplay } from "@/components/app-session-context";
import { FinanceRecovery } from "@/components/budget-manager";
import { useGoalDraftSessions } from "@/components/goal-draft-session-context";
import { Icon } from "@/components/icon";
import { ModalDialog } from "@/components/modal-dialog";
import type { Transaction } from "@/data/demo-ledger";
import { callFinanceOperation, FinanceClientError } from "@/lib/finance/client";
import { goalImageUrl } from "@/lib/goals/client";
import {
  executeGoalSave,
  type GoalDraft,
  type GoalDraftSession,
  goalDraftOf,
  goalEditorAvailability,
  goalHasDraftSettings,
  isGoalDraftDirty,
  newGoalSession,
  validateGoalDraft,
} from "@/lib/goals/draft";
import { goalSaveOperations } from "@/lib/goals/operations";
import { buildGoalPlan, type GoalPlan } from "@/lib/goals/plan";

type RunMutation = <Result>(operation: () => Promise<Result>) => Promise<Result>;

const demoGoals: FinancialGoal[] = [
  {
    id: "a1000000-0000-4000-8000-000000000001",
    name: "New laptop",
    target: { amountMinor: "18000000", currency: "IDR" },
    saved: { amountMinor: "6200000", currency: "IDR" },
    targetDate: "2027-04-30",
    status: "active",
    imagePath: null,
    deletedAt: null,
    createdAt: "2026-10-11T00:00:00Z",
    updatedAt: "2026-10-11T00:00:00Z",
  },
];

function formInputClass(error = false) {
  return `min-h-11 w-full rounded-xl border bg-surface px-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-focus/25 ${error ? "border-danger" : "border-border"}`;
}

function GoalImage({ goal, localUrl }: { goal: FinancialGoal; localUrl?: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const source = localUrl ?? goalImageUrl(goal);
  if (!source || source === failedSource) {
    return (
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <Icon className="h-6 w-6" name="sparkle" />
      </div>
    );
  }
  return (
    <Image
      alt=""
      className="h-16 w-16 shrink-0 rounded-2xl object-cover"
      height={64}
      onError={() => setFailedSource(source)}
      src={source}
      unoptimized
      width={64}
    />
  );
}

function GoalRecoveryFeedback({
  session,
  latest,
  refreshRequired,
  onRefreshRecords,
  onReviewLatest,
  onDiscard,
}: {
  session: GoalDraftSession;
  latest?: FinancialGoal;
  refreshRequired: boolean;
  onRefreshRecords?: () => Promise<void>;
  onReviewLatest: (goal: FinancialGoal) => void;
  onDiscard: () => void;
}) {
  const { formatRupiah } = useAmountDisplay();
  const { draft, pending } = session;
  const { changed, unavailable } = goalEditorAvailability(session, latest, refreshRequired);
  return (
    <>
      {session.savedGoal && (
        <p className="text-sm text-muted">
          Your goal is saved. Continuing only retries the photo; it won’t create another goal.
        </p>
      )}
      {session.error && (
        <p className="text-sm text-danger" role="alert">
          {session.error}
        </p>
      )}
      {(refreshRequired || session.uncertain) && (
        <FinanceRecovery
          message="Your submitted details are kept for this visit. Refresh your records before retrying the same change."
          onRefreshRecords={onRefreshRecords}
        />
      )}
      {(session.uncertain || unavailable) && !refreshRequired && !pending && (
        <Button onPress={onDiscard} variant="ghost">
          Discard kept draft…
        </Button>
      )}
      {changed && latest && (
        <div className="space-y-2 rounded-xl bg-warning/10 p-3 text-sm">
          <p>
            The saved goal changed. Latest: {latest.name} · target{" "}
            {formatRupiah(BigInt(latest.target.amountMinor))} · saved{" "}
            {formatRupiah(BigInt(latest.saved.amountMinor))} · {latest.targetDate}.
          </p>
          <GoalImage goal={latest} />
          <Button
            isDisabled={pending || refreshRequired}
            onPress={() => onReviewLatest(latest)}
            variant="secondary"
          >
            {session.savedGoal
              ? "Use latest goal version"
              : goalHasDraftSettings(latest, draft)
                ? "Use saved settings"
                : "Keep my entries and review"}
          </Button>
          <p className="text-xs text-muted">Nothing is sent until you choose Save again.</p>
        </div>
      )}
      {unavailable && (
        <p className="text-sm text-danger">
          This goal was removed. Your draft is kept. Close this form and check your goals before
          starting another.
        </p>
      )}
    </>
  );
}

function goalSaveLabel(session: GoalDraftSession): string {
  if (session.pending) return "Saving…";
  if (session.savedGoal) return session.draft.image ? "Retry photo" : "Finish save";
  return session.uncertain ? "Retry same change" : "Save goal";
}

function GoalDraftFields({
  draft,
  errors,
  today,
  locked,
  photoDisabled,
  onChange,
}: {
  draft: GoalDraft;
  errors: Record<string, string>;
  today: string;
  locked: boolean;
  photoDisabled: boolean;
  onChange: (draft: GoalDraft) => void;
}) {
  const id = useId();
  const field = (name: keyof GoalDraft) => ({
    name,
    "aria-invalid": Boolean(errors[name]),
    "aria-describedby": errors[name] ? `${id}-${name}-error` : undefined,
  });
  return (
    <>
      <fieldset className="grid min-w-0 gap-4" disabled={locked}>
        <label className="block text-sm font-semibold">
          Goal name
          <input
            {...field("name")}
            className={`${formInputClass(Boolean(errors.name))} mt-1`}
            maxLength={100}
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
            value={draft.name}
          />
          {errors.name && (
            <span className="mt-1 block text-xs text-danger" id={`${id}-name-error`}>
              {errors.name}
            </span>
          )}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold">
            Target (Rp)
            <input
              {...field("target")}
              className={`${formInputClass(Boolean(errors.target))} mt-1`}
              inputMode="numeric"
              onChange={(event) => onChange({ ...draft, target: event.target.value })}
              value={draft.target}
            />
            {errors.target && (
              <span className="mt-1 block text-xs text-danger" id={`${id}-target-error`}>
                {errors.target}
              </span>
            )}
          </label>
          <label className="block text-sm font-semibold">
            Already saved
            <input
              {...field("saved")}
              className={`${formInputClass(Boolean(errors.saved))} mt-1`}
              inputMode="numeric"
              onChange={(event) => onChange({ ...draft, saved: event.target.value })}
              value={draft.saved}
            />
            {errors.saved && (
              <span className="mt-1 block text-xs text-danger" id={`${id}-saved-error`}>
                {errors.saved}
              </span>
            )}
          </label>
        </div>
        <label className="block text-sm font-semibold">
          Target date
          <input
            {...field("targetDate")}
            className={`${formInputClass(Boolean(errors.targetDate))} mt-1`}
            min={today}
            onChange={(event) => onChange({ ...draft, targetDate: event.target.value })}
            type="date"
            value={draft.targetDate}
          />
          {errors.targetDate && (
            <span className="mt-1 block text-xs text-danger" id={`${id}-targetDate-error`}>
              {errors.targetDate}
            </span>
          )}
        </label>
      </fieldset>
      <label className="block text-sm font-semibold">
        Photo <span className="font-normal text-muted">(optional)</span>
        <input
          {...field("image")}
          accept="image/jpeg,image/png,image/webp"
          disabled={photoDisabled}
          className="mt-1 block w-full text-base file:mr-3 file:rounded-full file:border-0 file:bg-accent-soft file:px-4 file:py-2 file:font-semibold file:text-accent"
          onChange={(event) => onChange({ ...draft, image: event.target.files?.[0] ?? null })}
          type="file"
        />
        <span className="mt-1 block text-xs font-normal text-muted">
          JPEG, PNG, or WebP · max 3 MB
        </span>
        {errors.image && (
          <span className="mt-1 block text-xs text-danger" id={`${id}-image-error`}>
            {errors.image}
          </span>
        )}
      </label>
    </>
  );
}

function GoalEditor({
  session,
  latest,
  today,
  onClose,
  onDiscard,
  onChange,
  onReviewLatest,
  onSave,
  refreshRequired = false,
  onRefreshRecords,
}: {
  session: GoalDraftSession;
  latest?: FinancialGoal;
  today: string;
  onClose: () => void;
  onDiscard: () => void;
  onChange: (draft: GoalDraft) => void;
  onReviewLatest: (goal: FinancialGoal) => void;
  onSave: (draft: GoalDraft) => Promise<void>;
  refreshRequired?: boolean;
  onRefreshRecords?: () => Promise<void>;
}) {
  const { draft, pending, original: goal } = session;
  const [discard, setDiscard] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const { blocked, locked } = goalEditorAvailability(session, latest, refreshRequired);
  const setDraft = (next: GoalDraft) => {
    if (blocked || session.uncertain) return;
    onChange(next);
    setErrors({});
  };
  const close = () => {
    if (pending) return;
    if (discard) setDiscard(false);
    else if (session.uncertain || session.savedGoal) onClose();
    else if (isGoalDraftDirty(session)) setDiscard(true);
    else onDiscard();
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (blocked) return;
    try {
      const nextErrors = validateGoalDraft(draft);
      if (Object.keys(nextErrors).length > 0) {
        setErrors(nextErrors);
        const first = Object.keys(nextErrors)[0];
        event.currentTarget.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
        return;
      }
      setErrors({});
      setError(null);
      await onSave(draft);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The goal could not be saved.");
    }
  };
  return (
    <ModalDialog labelledBy="goal-editor-title" onClose={close}>
      {discard ? (
        <div className="space-y-4 p-5">
          <h2 className="text-xl font-bold" id="goal-editor-title">
            Keep this goal draft?
          </h2>
          <p className="text-sm text-muted">
            {session.uncertain || session.savedGoal
              ? "A goal may already be saved. Discarding this draft won’t delete it. Check your goals before starting another."
              : "Your entries haven’t been saved. Keep them for this visit, or discard them."}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onPress={onDiscard} variant="ghost">
              Discard draft
            </Button>
            <Button onPress={onClose} variant="secondary">
              Keep for later
            </Button>
            <Button autoFocus onPress={() => setDiscard(false)}>
              Keep editing
            </Button>
          </div>
        </div>
      ) : (
        <form aria-busy={pending} className="space-y-4 p-5" noValidate onSubmit={submit}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold" id="goal-editor-title">
              {goal ? "Edit goal" : "New goal"}
            </h2>
            <Button
              aria-label="Close goal form"
              isDisabled={pending}
              isIconOnly
              onPress={close}
              variant="ghost"
            >
              <Icon name="close" />
            </Button>
          </div>
          <GoalDraftFields
            draft={draft}
            errors={errors}
            today={today}
            locked={locked}
            photoDisabled={blocked || session.uncertain}
            onChange={setDraft}
          />
          <GoalRecoveryFeedback
            session={session}
            latest={latest}
            refreshRequired={refreshRequired}
            onRefreshRecords={onRefreshRecords}
            onReviewLatest={onReviewLatest}
            onDiscard={() => setDiscard(true)}
          />
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              className="min-h-11"
              isDisabled={pending}
              onPress={
                isGoalDraftDirty(session) || session.request || session.savedGoal
                  ? onClose
                  : onDiscard
              }
              variant="secondary"
            >
              Keep for later
            </Button>
            <Button className="min-h-11" isDisabled={blocked} type="submit">
              {goalSaveLabel(session)}
            </Button>
          </div>
        </form>
      )}
    </ModalDialog>
  );
}

function GoalRecoveryNotices({
  editorKey,
  onResume,
  pending,
}: {
  editorKey: string | null;
  onResume: (key: string) => void;
  pending: boolean;
}) {
  const drafts = useGoalDraftSessions();
  return (
    <>
      {drafts.notice && (
        <div
          className="mb-3 flex items-center gap-2 rounded-2xl bg-success/10 p-3 text-sm"
          role="status"
        >
          <p className="flex-1">{drafts.notice}</p>
          <Button
            aria-label="Dismiss goal saved message"
            isIconOnly
            onPress={() => drafts.setNotice(null)}
            variant="ghost"
          >
            <Icon name="close" />
          </Button>
        </div>
      )}
      {Object.entries(drafts.sessions)
        .filter(([key]) => key !== editorKey)
        .map(([key, session]) => (
          <div
            className="mb-3 rounded-2xl border border-border bg-surface-secondary p-4"
            key={key}
            role="status"
          >
            <p className="font-semibold">
              {session.pending
                ? "Saving your goal…"
                : session.savedGoal
                  ? "Your goal is saved. Let’s check the photo."
                  : session.uncertain
                    ? "Let’s check that goal save"
                    : "Your goal draft is here"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {session.draft.name || "New goal"} · Kept for this visit.
            </p>
            <Button
              className="mt-2 min-h-11"
              isDisabled={session.pending || pending}
              onPress={() => onResume(key)}
              variant="secondary"
            >
              {session.uncertain ? "Check save" : "Resume draft"}
            </Button>
          </div>
        ))}
    </>
  );
}

type FormatRupiah = (amount: bigint) => string;
const goalDateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function GoalPlanDetails({ plan, formatRupiah }: { plan: GoalPlan; formatRupiah: FormatRupiah }) {
  return (
    <details className="group mt-4 border-t border-separator pt-1">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-focus">
        How this is worked out
        <Icon
          className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          name="chevron-down"
        />
      </summary>
      <div className="grid min-w-0 grid-cols-3 gap-2 pb-1">
        <GoalMetric label="Avg income" value={formatRupiah(plan.monthlyIncome)} />
        <GoalMetric label="Avg spend" value={formatRupiah(plan.monthlyExpense)} />
        <GoalMetric accent label="Surplus" value={formatRupiah(plan.monthlySurplus)} />
      </div>
      <p className="mt-3 text-sm leading-6 text-muted">
        {plan.savingsRatePercent === null
          ? "No confirmed income yet."
          : `${plan.savingsRatePercent}% of confirmed income is left after spending.`}{" "}
        {plan.paceCoveragePercent === 999 ? "999%+" : `${plan.paceCoveragePercent}%`} of the goal
        pace is covered by your recent surplus.
      </p>
      {plan.monthlyGap > 0n && (
        <p className="mt-2 text-sm leading-6">
          There’s a {formatRupiah(plan.monthlyGap)} monthly gap. A later date or a smaller target
          can give you more room.
        </p>
      )}
      <p className="mt-3 text-xs leading-5 text-muted">
        Based on {plan.confirmedMonths} month{plan.confirmedMonths === 1 ? "" : "s"} of confirmed
        activity. Pending transactions and exclusions stay out. This is a plan, not money moved or
        set aside.
      </p>
    </details>
  );
}

function GoalPlanSummary({
  plan,
  status,
  formatRupiah,
  onAdd,
  pending,
}: {
  plan: GoalPlan;
  status: string;
  formatRupiah: FormatRupiah;
  onAdd: () => void;
  pending: boolean;
}) {
  const active = plan.active.length > 0;
  const completed = plan.completed.length > 0;
  return (
    <Card className="block min-w-0 w-full rounded-[1.5rem] border border-border bg-surface p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-accent">
            {active ? "Monthly saving pace" : "Your next milestone"}
          </p>
          <h2
            className="mt-2 break-words text-[28px] font-extrabold leading-tight tracking-[-0.035em]"
            id="goal-planner-title"
          >
            {active
              ? formatRupiah(plan.totalRequiredMonthly)
              : completed
                ? "You reached your goals."
                : "What are you saving for?"}
          </h2>
          {active && <p className="mt-1 text-xs text-muted">per month across your active goals</p>}
        </div>
        {active && (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <Icon className="h-5 w-5" name="sparkle" />
          </span>
        )}
      </div>
      <p className="mt-3 text-sm leading-6 text-muted">
        {active
          ? status
          : completed
            ? "Keep your milestones below, correct progress anytime, or start your next goal."
            : "Choose something you’re looking forward to. We’ll help you find a monthly pace that fits."}
      </p>
      <Button className="mt-4 min-h-11 w-full rounded-full" isDisabled={pending} onPress={onAdd}>
        <Icon className="h-4 w-4" name="plus" /> Add goal
      </Button>
      {active && plan.confirmedMonths > 0 && (
        <GoalPlanDetails plan={plan} formatRupiah={formatRupiah} />
      )}
    </Card>
  );
}

function GoalMetric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className={`min-w-0 rounded-xl p-2 ${accent ? "bg-accent-soft" : "bg-surface-secondary"}`}>
      <p className={`text-xs font-medium ${accent ? "text-accent" : "text-muted"}`}>{label}</p>
      <p className="mt-1 break-words text-xs font-bold tabular-nums">{value}</p>
    </div>
  );
}

function GoalPlanCard({
  item,
  localUrl,
  formatRupiah,
  onEdit,
  onDelete,
  pending,
}: {
  item: GoalPlan["active"][number];
  localUrl?: string;
  formatRupiah: FormatRupiah;
  onEdit: () => void;
  onDelete: () => void;
  pending: boolean;
}) {
  const completed = item.goal.status === "completed";
  const forecast =
    item.projectedMonths === null
      ? "Once your confirmed income is above spending, we can estimate a finish date."
      : item.monthlyShortfall > 0n
        ? `${formatRupiah(item.monthlyShortfall)} more per month is needed at this pace. At your recent surplus, this goal takes about ${item.projectedMonths} months.`
        : `At your recent surplus, this goal takes about ${item.projectedMonths} months.`;
  return (
    <Card className="block min-w-0 w-full rounded-[1.5rem] border border-border bg-surface p-4">
      <div className="flex min-w-0 items-start gap-3">
        <GoalImage goal={item.goal} localUrl={localUrl} />
        <div className="min-w-0 flex-1 py-1">
          <h3 className="break-words text-base font-bold leading-6">{item.goal.name}</h3>
          <p className="mt-1 text-xs leading-5 text-muted">
            Target {goalDateFormat.format(new Date(`${item.goal.targetDate}T00:00:00Z`))}
          </p>
        </div>
        <Button
          aria-label={`Edit ${item.goal.name}`}
          className="min-h-11 min-w-11 shrink-0"
          isDisabled={pending}
          isIconOnly
          onPress={onEdit}
          size="sm"
          variant="ghost"
        >
          <Icon className="h-4 w-4" name="pencil" />
        </Button>
      </div>
      <div className="mt-4 flex min-w-0 items-baseline justify-between gap-3">
        <p className="min-w-0 break-words text-xl font-bold tracking-tight tabular-nums">
          {formatRupiah(BigInt(item.goal.saved.amountMinor))}
          <span className="ml-1 text-xs font-medium tracking-normal text-muted">saved</span>
        </p>
        <span className="shrink-0 text-sm font-semibold text-accent tabular-nums">
          {item.progressPercent}%
        </span>
      </div>
      <ProgressBar
        aria-label={`${item.goal.name} progress`}
        className="mt-3 min-w-0 w-full"
        value={item.progressPercent}
      >
        <ProgressBar.Track className="h-2.5 rounded-full bg-surface-tertiary">
          <ProgressBar.Fill className="rounded-full bg-accent" />
        </ProgressBar.Track>
      </ProgressBar>
      <p className="mt-2 text-xs leading-5 text-muted">
        of {formatRupiah(BigInt(item.goal.target.amountMinor))}
        {completed ? " · Goal complete" : ` · ${formatRupiah(item.remaining)} to go`}
      </p>
      {!completed && (
        <div className="mt-4 rounded-2xl bg-surface-secondary p-3">
          <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-medium text-muted">Set aside each month</p>
            <p className="break-words text-sm font-bold tabular-nums">
              {formatRupiah(item.requiredMonthly)}
            </p>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted">
            {item.daysLeft > 0
              ? `${item.daysLeft} days to your target date.`
              : "Your target date has arrived. Edit the date or saved progress to update your plan."}
          </p>
        </div>
      )}
      <div className="mt-3 flex min-w-0 items-start justify-between gap-3 border-t border-separator pt-2">
        <p className="min-w-0 flex-1 pt-2 text-xs leading-5 text-muted">
          {completed ? "Need to correct progress? You can edit this goal anytime." : forecast}
        </p>
        <Button
          className="min-h-11 shrink-0 text-danger"
          isDisabled={pending}
          onPress={onDelete}
          size="sm"
          variant="ghost"
        >
          Delete
        </Button>
      </div>
    </Card>
  );
}

function GoalDeleteDialog({
  original,
  latest,
  pending,
  error,
  needsReview,
  canReviewLatest,
  refreshRequired,
  onRefreshRecords,
  onReviewLatest,
  onClose,
  onDelete,
}: {
  original: FinancialGoal;
  latest?: FinancialGoal;
  pending: boolean;
  error: string | null;
  needsReview: boolean;
  canReviewLatest: boolean;
  refreshRequired: boolean;
  onRefreshRecords?: () => Promise<void>;
  onReviewLatest: (goal: FinancialGoal) => void;
  onClose: () => void;
  onDelete: () => Promise<void>;
}) {
  const { formatRupiah } = useAmountDisplay();
  if (!latest && !refreshRequired && !pending)
    return (
      <ModalDialog labelledBy="delete-goal-title" onClose={onClose}>
        <div className="space-y-4 p-5">
          <h2 className="text-xl font-bold" id="delete-goal-title">
            Goal already removed
          </h2>
          <p className="text-sm leading-6 text-muted">
            This goal is no longer in your plan. Your transactions and budget limits are unchanged.
          </p>
          <Button className="min-h-11" onPress={onClose}>
            Back to goals
          </Button>
        </div>
      </ModalDialog>
    );
  return (
    <ModalDialog
      labelledBy="delete-goal-title"
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      <div aria-busy={pending} className="space-y-4 p-5">
        <h2 className="break-words text-xl font-bold" id="delete-goal-title">
          Delete {original.name}?
        </h2>
        <p className="text-sm leading-6 text-muted">
          This permanently removes the goal from your plan. Your transactions and budget limits stay
          unchanged.
        </p>
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        {refreshRequired && (
          <FinanceRecovery
            message="Refresh your records to check the deletion result."
            onRefreshRecords={onRefreshRecords}
          />
        )}
        {needsReview && latest && (
          <div className="space-y-2 rounded-xl bg-warning/10 p-3 text-sm" role="status">
            <p>This goal changed. Check the latest version before deleting it.</p>
            {canReviewLatest ? (
              <>
                <p className="break-words">
                  Latest: {latest.name} · target {formatRupiah(BigInt(latest.target.amountMinor))} ·
                  saved {formatRupiah(BigInt(latest.saved.amountMinor))} · {latest.targetDate}.
                </p>
                <Button
                  className="min-h-11"
                  isDisabled={pending || refreshRequired}
                  onPress={() => onReviewLatest(latest)}
                  variant="secondary"
                >
                  Review this version
                </Button>
              </>
            ) : (
              <FinanceRecovery
                message="Refresh to see the latest goal."
                onRefreshRecords={onRefreshRecords}
              />
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button
            autoFocus
            className="min-h-11"
            isDisabled={pending}
            onPress={onClose}
            variant="secondary"
          >
            Keep goal
          </Button>
          <Button
            className="min-h-11"
            isDisabled={pending || refreshRequired || needsReview || !latest}
            onPress={onDelete}
            variant="danger"
          >
            {pending ? "Deleting…" : "Delete goal"}
          </Button>
        </div>
      </div>
    </ModalDialog>
  );
}

export function GoalPlanner({
  goals,
  transactions,
  today,
  demo,
  runMutation,
  refreshRequired = false,
  onRefreshRecords,
}: {
  goals: FinancialGoal[];
  transactions: Transaction[];
  today: string;
  demo: boolean;
  runMutation?: RunMutation;
  refreshRequired?: boolean;
  onRefreshRecords?: () => Promise<void>;
}) {
  const { formatRupiah } = useAmountDisplay();
  const drafts = useGoalDraftSessions();
  const demoState = drafts.demoGoals ?? demoGoals;
  const setDemoState = (update: (goals: FinancialGoal[]) => FinancialGoal[]) =>
    drafts.setDemoGoals((previous) => update(previous ?? demoGoals));
  const { localImages, setLocalImages } = drafts;
  const [editorKey, setEditorKey] = useState<string | null>(null);
  const editingSession = editorKey ? drafts.sessions[editorKey] : undefined;
  const [deleting, setDeleting] = useState<FinancialGoal | null>(null);
  const [deletePending, setPending] = useState(false);
  const [deleteConflict, setDeleteConflict] = useState(false);
  const [failedDeleteGoals, setFailedDeleteGoals] = useState<FinancialGoal[] | null>(null);
  const pending =
    deletePending || Object.values(drafts.sessions).some((session) => session.pending);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const current = demo ? demoState : goals;
  const deleteLatest = current.find((goal) => goal.id === deleting?.id && !goal.deletedAt);
  const deleteChanged = Boolean(deleteLatest && deleteLatest.updatedAt !== deleting?.updatedAt);
  const deleteNeedsReview = deleteChanged || deleteConflict;
  const closeDelete = () => {
    if (!inFlight.current) setDeleting(null);
  };
  const openDelete = (goal: FinancialGoal) => {
    if (pending) return;
    setDeleting(goal);
    setDeleteConflict(false);
    setFailedDeleteGoals(null);
    setError(null);
  };
  const plan = useMemo(
    () => buildGoalPlan(current, transactions, today),
    [current, transactions, today],
  );
  const status = {
    "no-history": "Add confirmed income and expenses to estimate a monthly pace.",
    "on-track": "Your recent surplus can cover this pace.",
    tight: "This pace uses most of your recent surplus.",
    "needs-adjustment": "The monthly pace is above your recent surplus.",
    complete: "All current goals are complete.",
  }[plan.state];

  const openEditor = (goal: FinancialGoal | null) => {
    if (pending) return;
    const key = goal ? `edit:${goal.id}` : "create";
    if (!drafts.get(key)) drafts.keep(key, newGoalSession(goal, today));
    setEditorKey(key);
  };
  const openNewEditor = () => openEditor(null);
  const openExistingEditor = (goal: FinancialGoal) => openEditor(goal);
  const closeEditor = () => {
    if (editorKey && drafts.get(editorKey)?.pending) return;
    setEditorKey(null);
  };
  const discardEditor = () => {
    if (!editorKey || drafts.get(editorKey)?.pending) return;
    drafts.forget(editorKey);
    setEditorKey(null);
  };
  const reviewLatest = (latest: FinancialGoal) => {
    if (!editorKey || refreshRequired) return;
    const session = drafts.get(editorKey);
    if (!session || session.pending) return;
    const reflected = session.uncertain && goalHasDraftSettings(latest, session.draft);
    drafts.keep(editorKey, {
      ...session,
      original: latest,
      initial: goalDraftOf(latest),
      request: session.savedGoal || reflected ? session.request : null,
      savedGoal: session.savedGoal || reflected ? latest : null,
      uncertain: false,
      error: null,
    });
  };

  const save = async () => {
    if (!editorKey || refreshRequired || pending) return;
    const key = editorKey;
    const session = drafts.get(key);
    if (!session || !drafts.claim(key)) return;
    try {
      const result = await executeGoalSave(session, {
        keep: (next) => drafts.keep(key, next),
        ...goalSaveOperations({
          demo,
          original: session.original,
          today,
          runMutation,
          updateDemo: setDemoState,
          updateImages: setLocalImages,
        }),
      });
      if (result) {
        drafts.forget(key);
        setEditorKey((active) => (active === key ? null : active));
        drafts.setNotice("Goal saved. Your transactions and budget limits are unchanged.");
        setError(null);
      }
    } finally {
      drafts.release(key);
    }
  };

  const remove = async () => {
    if (!deleting || inFlight.current || refreshRequired || deleteNeedsReview || !deleteLatest)
      return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      if (demo) setDemoState((items) => items.filter((goal) => goal.id !== deleting.id));
      else {
        if (!runMutation) throw new Error("Goals are unavailable.");
        await runMutation(() =>
          callFinanceOperation("delete_financial_goal", {
            goalId: deleting.id,
            expectedUpdatedAt: deleting.updatedAt,
          }),
        );
      }
      setDeleting(null);
      setError(null);
      drafts.setNotice("Goal deleted. Your transactions and budget limits are unchanged.");
    } catch (failure) {
      const conflict =
        failure instanceof FinanceClientError &&
        (failure.code === "CONFLICT" || failure.code === "NOT_FOUND");
      if (conflict) {
        setFailedDeleteGoals(current);
        setDeleteConflict(true);
      }
      setError(
        failure instanceof FinanceClientError
          ? failure.message
          : "The deletion result couldn’t be checked. Refresh your records before trying again.",
      );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <section aria-labelledby="goal-planner-title" className="mt-4">
      <GoalRecoveryNotices editorKey={editorKey} onResume={setEditorKey} pending={pending} />
      <GoalPlanSummary
        formatRupiah={formatRupiah}
        onAdd={openNewEditor}
        pending={pending}
        plan={plan}
        status={status}
      />

      {error && (
        <p className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        {plan.active.map((item) => (
          <GoalPlanCard
            formatRupiah={formatRupiah}
            item={item}
            key={item.goal.id}
            localUrl={localImages[item.goal.id]}
            onDelete={() => openDelete(item.goal)}
            onEdit={() => openExistingEditor(item.goal)}
            pending={pending}
          />
        ))}
      </div>
      {plan.active.length === 0 && plan.completed.length === 0 && (
        <div className="mt-3 rounded-2xl border border-dashed border-border p-8 text-center">
          <Icon className="mx-auto h-7 w-7 text-accent" name="sparkle" />
          <p className="mt-2 text-sm font-semibold">Add something worth saving for.</p>
          <p className="mt-1 text-xs text-muted">
            Monara will estimate the monthly pace from confirmed records.
          </p>
        </div>
      )}
      {plan.completed.length > 0 && (
        <details className="group mt-4 min-w-0 rounded-2xl border border-border bg-surface-secondary p-3">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl px-1 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-focus">
            Completed · {plan.completed.length}
            <Icon
              className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
              name="chevron-down"
            />
          </summary>
          <div className="mt-2 grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2">
            {plan.completed.map((item) => (
              <GoalPlanCard
                formatRupiah={formatRupiah}
                item={item}
                key={item.goal.id}
                localUrl={localImages[item.goal.id]}
                onDelete={() => openDelete(item.goal)}
                onEdit={() => openExistingEditor(item.goal)}
                pending={pending}
              />
            ))}
          </div>
        </details>
      )}

      {editorKey && editingSession && (
        <GoalEditor
          key={editorKey}
          session={editingSession}
          latest={current.find(
            (goal) =>
              goal.id === (editingSession.savedGoal?.id ?? editingSession.original?.id) &&
              goal.deletedAt === null,
          )}
          onClose={closeEditor}
          onDiscard={discardEditor}
          onChange={(draft) => {
            const session = drafts.get(editorKey);
            if (session && !session.pending && !session.uncertain)
              drafts.keep(editorKey, { ...session, draft, error: null });
          }}
          onReviewLatest={reviewLatest}
          onSave={save}
          refreshRequired={refreshRequired}
          onRefreshRecords={onRefreshRecords}
          today={today}
        />
      )}
      {deleting && (
        <GoalDeleteDialog
          original={deleting}
          latest={deleteLatest}
          pending={deletePending}
          error={error}
          needsReview={deleteNeedsReview}
          canReviewLatest={deleteChanged || current !== failedDeleteGoals}
          refreshRequired={refreshRequired}
          onRefreshRecords={onRefreshRecords}
          onClose={closeDelete}
          onDelete={remove}
          onReviewLatest={(goal) => {
            setDeleting(goal);
            setDeleteConflict(false);
            setError(null);
          }}
        />
      )}
    </section>
  );
}
