"use client";

import type { FinancialGoal } from "@monara/contracts";
import { Button, Card } from "@monara/ui";
import Image from "next/image";
import { type FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";

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
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <Icon className="h-6 w-6" name="sparkle" />
      </div>
    );
  }
  return (
    <Image
      alt=""
      className="h-12 w-12 shrink-0 rounded-2xl object-cover"
      height={48}
      onError={() => setFailedSource(source)}
      src={source}
      unoptimized
      width={48}
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
  focusProgress,
  onChange,
}: {
  draft: GoalDraft;
  errors: Record<string, string>;
  today: string;
  locked: boolean;
  photoDisabled: boolean;
  focusProgress: boolean;
  onChange: (draft: GoalDraft) => void;
}) {
  const id = useId();
  const progressInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focusProgress) return;
    const frame = requestAnimationFrame(() => progressInput.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [focusProgress]);
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
              ref={progressInput}
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
            focusProgress={Boolean(goal)}
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

function GoalPlanDetails({
  plan,
  status,
  formatRupiah,
}: {
  plan: GoalPlan;
  status: string;
  formatRupiah: FormatRupiah;
}) {
  return (
    <div className="space-y-3 border-t border-separator px-4 pb-4 pt-3">
      <p className="text-sm leading-6 text-muted">{status}</p>
      <div className="grid min-w-0 grid-cols-3 gap-2">
        <GoalMetric label="Avg income" value={formatRupiah(plan.monthlyIncome)} />
        <GoalMetric label="Avg spend" value={formatRupiah(plan.monthlyExpense)} />
        <GoalMetric label="Surplus" value={formatRupiah(plan.monthlySurplus)} />
      </div>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Savings rate</dt>
          <dd className="font-semibold">
            {plan.savingsRatePercent === null ? "No income yet" : `${plan.savingsRatePercent}%`}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Pace covered</dt>
          <dd className="font-semibold">
            {plan.paceCoveragePercent === 999 ? "999%+" : `${plan.paceCoveragePercent}%`}
          </dd>
        </div>
        {plan.monthlyGap > 0n && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Monthly gap</dt>
            <dd className="font-semibold">{formatRupiah(plan.monthlyGap)}</dd>
          </div>
        )}
      </dl>
      <p className="text-xs leading-5 text-muted">
        {plan.confirmedMonths} month{plan.confirmedMonths === 1 ? "" : "s"} of confirmed activity.
        Pending and exclusions stay out.
      </p>
    </div>
  );
}

function GoalPlanSummary({
  plan,
  status,
  formatRupiah,
}: {
  plan: GoalPlan;
  status: string;
  formatRupiah: FormatRupiah;
}) {
  if (plan.active.length === 0) return null;
  return (
    <details className="group/goal-plan mt-5 min-w-0 rounded-2xl border border-border bg-surface">
      <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-2xl px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-focus">
        <span className="text-sm font-medium">Monthly plan</span>
        <span className="flex min-w-0 items-center gap-3">
          <strong className="break-words text-sm tabular-nums">
            {formatRupiah(plan.totalRequiredMonthly)}
            <span className="text-xs font-normal text-muted"> / mo</span>
          </strong>
          <Icon
            className="h-4 w-4 shrink-0 transition-transform group-open/goal-plan:rotate-180 motion-reduce:transition-none"
            name="chevron-down"
          />
        </span>
      </summary>
      <GoalPlanDetails plan={plan} status={status} formatRupiah={formatRupiah} />
    </details>
  );
}

function GoalMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-secondary p-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 break-words text-xs font-bold tabular-nums">{value}</p>
    </div>
  );
}

function GoalCardDetails({
  item,
  formatRupiah,
  onEdit,
  onDelete,
  pending,
}: {
  item: GoalPlan["active"][number];
  formatRupiah: FormatRupiah;
  onEdit: () => void;
  onDelete: () => void;
  pending: boolean;
}) {
  const completed = item.goal.status === "completed";
  return (
    <details className="group/goal-details border-t border-separator">
      <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-b-[1.5rem] px-4 text-xs font-medium text-muted outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset">
        <span>Plan details</span>
        <Icon
          className="h-4 w-4 shrink-0 transition-transform group-open/goal-details:rotate-180 motion-reduce:transition-none"
          name="chevron-down"
        />
      </summary>
      <div className="space-y-3 px-4 pb-4">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Target date</dt>
            <dd>{goalDateFormat.format(new Date(`${item.goal.targetDate}T00:00:00Z`))}</dd>
          </div>
          {!completed && (
            <>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Monthly pace</dt>
                <dd className="font-semibold">{formatRupiah(item.requiredMonthly)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Time left</dt>
                <dd>{item.daysLeft === 0 ? "Target date reached" : `${item.daysLeft} days`}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Estimated finish</dt>
                <dd>
                  {item.projectedMonths === null
                    ? "No surplus yet"
                    : `≈ ${item.projectedMonths} months`}
                </dd>
              </div>
              {item.monthlyShortfall > 0n && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Monthly gap</dt>
                  <dd>{formatRupiah(item.monthlyShortfall)}</dd>
                </div>
              )}
            </>
          )}
        </dl>
        <div className="flex flex-wrap justify-between gap-2 border-t border-separator pt-2">
          <Button
            className="min-h-11 rounded-full"
            isDisabled={pending}
            onPress={onEdit}
            variant="secondary"
          >
            <Icon className="h-4 w-4" name="pencil" />
            Edit goal
          </Button>
          <Button
            aria-label={`Delete ${item.goal.name}`}
            className="min-h-11 text-danger"
            isDisabled={pending}
            onPress={onDelete}
            variant="ghost"
          >
            Delete goal
          </Button>
        </div>
      </div>
    </details>
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
  const descriptionId = `goal-${item.goal.id}-state`;
  return (
    <Card className="block min-w-0 w-full overflow-hidden rounded-[1.5rem] border border-border bg-surface p-0">
      <button
        aria-describedby={descriptionId}
        aria-label={`Update progress for ${item.goal.name}, ${item.progressPercent}% saved`}
        className="group block min-w-0 w-full cursor-pointer rounded-[1.5rem] p-4 text-left transition-colors outline-none hover:bg-accent-soft/35 active:bg-accent-soft/60 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset disabled:cursor-wait disabled:opacity-60"
        disabled={pending}
        onClick={onEdit}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-3">
          <GoalImage goal={item.goal} localUrl={localUrl} />
          <span className="min-w-0 flex-1">
            <span className="block break-words text-base font-bold leading-6">
              {item.goal.name}
            </span>
            <span className="mt-0.5 block text-xs text-muted">
              {completed
                ? "Completed"
                : goalDateFormat.format(new Date(`${item.goal.targetDate}T00:00:00Z`))}
            </span>
          </span>
          <Icon
            className="h-4 w-4 shrink-0 text-muted"
            name={completed ? "check" : "chevron-right"}
          />
        </span>
        <span className="mt-5 flex min-w-0 items-baseline justify-between gap-3">
          <strong className="min-w-0 break-words text-[28px] font-extrabold tracking-tight tabular-nums">
            {formatRupiah(BigInt(item.goal.saved.amountMinor))}
          </strong>
          <span className="shrink-0 text-sm font-semibold text-accent tabular-nums">
            {item.progressPercent}%
          </span>
        </span>
        <span className="mt-1 block text-xs text-muted">
          saved of {formatRupiah(BigInt(item.goal.target.amountMinor))}
        </span>
        <span
          aria-hidden="true"
          className="mt-4 block h-2.5 overflow-hidden rounded-full bg-surface-tertiary"
        >
          <span
            className="block h-full rounded-full bg-accent"
            style={{ width: `${item.progressPercent}%` }}
          />
        </span>
        <span className="mt-4 flex min-w-0 items-center justify-between gap-3">
          <span className="text-sm font-semibold text-accent">Update progress</span>
          <Icon
            className="h-4 w-4 text-accent transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"
            name="arrow"
          />
        </span>
      </button>
      <span className="sr-only" id={descriptionId}>
        {formatRupiah(BigInt(item.goal.saved.amountMinor))} saved of{" "}
        {formatRupiah(BigInt(item.goal.target.amountMinor))}. {item.progressPercent}% complete.
        Target {goalDateFormat.format(new Date(`${item.goal.targetDate}T00:00:00Z`))}.{" "}
        {completed ? "Completed." : "Active."}
      </span>
      <GoalCardDetails
        item={item}
        formatRupiah={formatRupiah}
        onEdit={onEdit}
        onDelete={onDelete}
        pending={pending}
      />
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
    <section aria-labelledby="goal-planner-title">
      <div className="mb-5 flex min-w-0 items-center justify-between gap-3">
        <h1 className="text-[32px] font-extrabold tracking-[-0.04em]" id="goal-planner-title">
          Goals
        </h1>
        <Button
          aria-label="New goal"
          className="min-h-11 rounded-full"
          isDisabled={pending}
          onPress={openNewEditor}
        >
          <Icon className="h-4 w-4" name="plus" />
          New goal
        </Button>
      </div>
      <GoalRecoveryNotices editorKey={editorKey} onResume={setEditorKey} pending={pending} />

      {error && (
        <p className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
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
          <p className="mt-3 text-base font-semibold">Your first goal starts here.</p>
          <p className="mt-1 text-sm text-muted">A target. A date. Your progress.</p>
        </div>
      )}
      <GoalPlanSummary formatRupiah={formatRupiah} plan={plan} status={status} />
      {plan.completed.length > 0 && (
        <details className="group/completed mt-4 min-w-0 rounded-2xl border border-border bg-surface-secondary p-3">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl px-1 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-focus">
            Completed · {plan.completed.length}
            <Icon
              className="h-4 w-4 transition-transform group-open/completed:rotate-180 motion-reduce:transition-none"
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
