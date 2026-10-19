"use client";

import {
  createFinancialGoalInputSchema,
  type FinancialGoal,
  updateFinancialGoalInputSchema,
} from "@monara/contracts";
import { Button, Card, ProgressBar } from "@monara/ui";
import Image from "next/image";
import { type FormEvent, useMemo, useRef, useState } from "react";

import { useAmountDisplay } from "@/components/app-session-context";
import { Icon } from "@/components/icon";
import { ModalDialog } from "@/components/modal-dialog";
import type { Transaction } from "@/data/demo-ledger";
import { callFinanceOperation, FinanceClientError } from "@/lib/finance/client";
import { parseDraftAmount } from "@/lib/finance/presentation";
import { goalImageUrl, uploadGoalImage } from "@/lib/goals/client";
import { buildGoalPlan } from "@/lib/goals/plan";

type RunMutation = <Result>(operation: () => Promise<Result>) => Promise<Result>;
type GoalDraft = {
  name: string;
  target: string;
  saved: string;
  targetDate: string;
  image: File | null;
};

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

function newDraft(today: string): GoalDraft {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 6);
  return {
    name: "",
    target: "",
    saved: "0",
    targetDate: date.toISOString().slice(0, 10),
    image: null,
  };
}

function goalDraft(goal: FinancialGoal): GoalDraft {
  return {
    name: goal.name,
    target: goal.target.amountMinor,
    saved: goal.saved.amountMinor,
    targetDate: goal.targetDate,
    image: null,
  };
}

function formInputClass(error = false) {
  return `min-h-11 w-full rounded-xl border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-focus/25 ${error ? "border-danger" : "border-border"}`;
}

function GoalImage({ goal, localUrl }: { goal: FinancialGoal; localUrl?: string }) {
  const [failed, setFailed] = useState(false);
  const source = localUrl ?? goalImageUrl(goal);
  if (!source || failed) {
    return (
      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <Icon className="h-7 w-7" name="image" />
      </div>
    );
  }
  return (
    <Image
      alt=""
      className="h-20 w-20 shrink-0 rounded-2xl object-cover"
      height={80}
      onError={() => setFailed(true)}
      src={source}
      unoptimized
      width={80}
    />
  );
}

function GoalEditor({
  goal,
  today,
  pending,
  onClose,
  onSave,
}: {
  goal: FinancialGoal | null;
  today: string;
  pending: boolean;
  onClose: () => void;
  onSave: (draft: GoalDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => (goal ? goalDraft(goal) : newDraft(today)));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const target = parseDraftAmount(draft.target);
      const saved = parseDraftAmount(draft.saved);
      const nextErrors: Record<string, string> = {};
      if (!draft.name.trim()) nextErrors.name = "Add a goal name.";
      if (target === null || target <= 0) nextErrors.target = "Enter a positive target.";
      if (saved === null || saved < 0) nextErrors.saved = "Enter the amount already saved.";
      if (target !== null && saved !== null && saved > target)
        nextErrors.saved = "Saved cannot exceed the target.";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.targetDate))
        nextErrors.targetDate = "Choose a target date.";
      if (
        draft.image &&
        (draft.image.size > 3 * 1024 * 1024 ||
          !["image/jpeg", "image/png", "image/webp"].includes(draft.image.type))
      ) {
        nextErrors.image = "Choose a JPEG, PNG, or WebP under 3 MB.";
      }
      if (Object.keys(nextErrors).length > 0) {
        setErrors(nextErrors);
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
    <ModalDialog labelledBy="goal-editor-title" onClose={onClose}>
      <form className="space-y-4 p-5" noValidate onSubmit={submit}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold" id="goal-editor-title">
            {goal ? "Edit goal" : "New goal"}
          </h2>
          <Button aria-label="Close goal form" isIconOnly onPress={onClose} variant="ghost">
            <Icon name="close" />
          </Button>
        </div>
        <label className="block text-sm font-semibold">
          Goal name
          <input
            className={`${formInputClass(Boolean(errors.name))} mt-1`}
            maxLength={100}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            value={draft.name}
          />
          {errors.name && <span className="mt-1 block text-xs text-danger">{errors.name}</span>}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold">
            Target (Rp)
            <input
              className={`${formInputClass(Boolean(errors.target))} mt-1`}
              inputMode="numeric"
              onChange={(event) => setDraft({ ...draft, target: event.target.value })}
              value={draft.target}
            />
            {errors.target && (
              <span className="mt-1 block text-xs text-danger">{errors.target}</span>
            )}
          </label>
          <label className="block text-sm font-semibold">
            Already saved
            <input
              className={`${formInputClass(Boolean(errors.saved))} mt-1`}
              inputMode="numeric"
              onChange={(event) => setDraft({ ...draft, saved: event.target.value })}
              value={draft.saved}
            />
            {errors.saved && <span className="mt-1 block text-xs text-danger">{errors.saved}</span>}
          </label>
        </div>
        <label className="block text-sm font-semibold">
          Target date
          <input
            className={`${formInputClass(Boolean(errors.targetDate))} mt-1`}
            min={today}
            onChange={(event) => setDraft({ ...draft, targetDate: event.target.value })}
            type="date"
            value={draft.targetDate}
          />
          {errors.targetDate && (
            <span className="mt-1 block text-xs text-danger">{errors.targetDate}</span>
          )}
        </label>
        <label className="block text-sm font-semibold">
          Photo <span className="font-normal text-muted">(optional)</span>
          <input
            accept="image/jpeg,image/png,image/webp"
            className="mt-1 block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-accent-soft file:px-4 file:py-2 file:font-semibold file:text-accent"
            onChange={(event) => setDraft({ ...draft, image: event.target.files?.[0] ?? null })}
            type="file"
          />
          <span className="mt-1 block text-xs font-normal text-muted">
            JPEG, PNG, or WebP · max 3 MB
          </span>
          {errors.image && <span className="mt-1 block text-xs text-danger">{errors.image}</span>}
        </label>
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button className="min-h-11" isDisabled={pending} onPress={onClose} variant="secondary">
            Cancel
          </Button>
          <Button className="min-h-11" isDisabled={pending} type="submit">
            {pending ? "Saving…" : "Save goal"}
          </Button>
        </div>
      </form>
    </ModalDialog>
  );
}

export function GoalPlanner({
  goals,
  transactions,
  today,
  demo,
  runMutation,
}: {
  goals: FinancialGoal[];
  transactions: Transaction[];
  today: string;
  demo: boolean;
  runMutation?: RunMutation;
}) {
  const { formatRupiah } = useAmountDisplay();
  const [demoState, setDemoState] = useState(demoGoals);
  const [localImages, setLocalImages] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<FinancialGoal | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<FinancialGoal | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const current = demo ? demoState : goals;
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

  const save = async (draft: GoalDraft) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      const target = parseDraftAmount(draft.target) ?? 0;
      const saved = parseDraftAmount(draft.saved) ?? 0;
      if (demo) {
        const id = editing?.id ?? crypto.randomUUID();
        const now = new Date().toISOString();
        const item: FinancialGoal = {
          id,
          name: draft.name.trim(),
          target: { amountMinor: String(target), currency: "IDR" },
          saved: { amountMinor: String(saved), currency: "IDR" },
          targetDate: draft.targetDate,
          status: target === saved ? "completed" : "active",
          imagePath: null,
          deletedAt: null,
          createdAt: editing?.createdAt ?? now,
          updatedAt: now,
        };
        setDemoState((items) =>
          editing ? items.map((goal) => (goal.id === item.id ? item : goal)) : [...items, item],
        );
        if (draft.image) {
          const localImage = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.addEventListener("load", () => resolve(String(reader.result)), { once: true });
            reader.addEventListener(
              "error",
              () => reject(new Error("The image preview could not be loaded.")),
              { once: true },
            );
            reader.readAsDataURL(draft.image as File);
          });
          setLocalImages((images) => ({ ...images, [id]: localImage }));
        }
      } else {
        if (!runMutation) throw new Error("Goals are unavailable.");
        await runMutation(async () => {
          const result = editing
            ? await callFinanceOperation(
                "edit_financial_goal",
                updateFinancialGoalInputSchema.parse({
                  goalId: editing.id,
                  expectedUpdatedAt: editing.updatedAt,
                  changes: {
                    name: draft.name,
                    target: { amountMinor: String(target), currency: "IDR" },
                    saved: { amountMinor: String(saved), currency: "IDR" },
                    targetDate: draft.targetDate,
                  },
                }),
              )
            : await callFinanceOperation(
                "create_financial_goal",
                createFinancialGoalInputSchema.parse({
                  clientRequestId: crypto.randomUUID(),
                  name: draft.name,
                  target: { amountMinor: String(target), currency: "IDR" },
                  saved: { amountMinor: String(saved), currency: "IDR" },
                  targetDate: draft.targetDate,
                }),
              );
          return draft.image ? uploadGoalImage(result, draft.image) : result;
        });
      }
      setEditing(undefined);
      setError(null);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  const remove = async () => {
    if (!deleting || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
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
    } catch (failure) {
      setError(
        failure instanceof FinanceClientError ? failure.message : "The goal could not be deleted.",
      );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <section aria-labelledby="goal-planner-title" className="mt-4">
      <Card className="block rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
              Monthly pace
            </p>
            <h2 className="mt-1 text-xl font-extrabold" id="goal-planner-title">
              {formatRupiah(plan.totalRequiredMonthly)}{" "}
              <span className="text-sm font-medium text-muted">needed</span>
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted">{status}</p>
          </div>
          <Button className="min-h-10 shrink-0 rounded-full" onPress={() => setEditing(null)}>
            <Icon className="h-4 w-4" name="plus" /> Add
          </Button>
        </div>
        {plan.confirmedMonths > 0 && (
          <p className="mt-3 border-t border-separator pt-3 text-xs text-muted">
            Recent monthly surplus:{" "}
            <strong className="text-foreground">{formatRupiah(plan.monthlySurplus)}</strong>
          </p>
        )}
      </Card>

      {error && (
        <p className="mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {plan.active.map((item) => (
          <Card
            className="block rounded-2xl border border-border bg-surface p-4"
            key={item.goal.id}
          >
            <div className="flex min-w-0 gap-3">
              <GoalImage goal={item.goal} localUrl={localImages[item.goal.id]} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold">{item.goal.name}</h3>
                    <p className="mt-0.5 text-xs text-muted">Target {item.goal.targetDate}</p>
                  </div>
                  <Button
                    aria-label={`Edit ${item.goal.name}`}
                    isIconOnly
                    onPress={() => setEditing(item.goal)}
                    size="sm"
                    variant="ghost"
                  >
                    <Icon className="h-4 w-4" name="pencil" />
                  </Button>
                </div>
                <ProgressBar
                  aria-label={`${item.goal.name} progress`}
                  className="mt-3"
                  value={item.progressPercent}
                >
                  <ProgressBar.Track className="h-2 bg-surface-tertiary">
                    <ProgressBar.Fill className="bg-accent" />
                  </ProgressBar.Track>
                </ProgressBar>
                <div className="mt-2 flex justify-between gap-2 text-xs">
                  <span>{formatRupiah(BigInt(item.goal.saved.amountMinor))} saved</span>
                  <strong>{item.progressPercent}%</strong>
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-separator pt-3 text-xs">
              <span className="text-muted">
                {formatRupiah(item.requiredMonthly)}/month · {item.daysLeft} days
              </span>
              <Button
                className="min-h-9 text-danger"
                onPress={() => setDeleting(item.goal)}
                size="sm"
                variant="ghost"
              >
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {plan.active.length === 0 && (
        <div className="mt-3 rounded-2xl border border-dashed border-border p-8 text-center">
          <Icon className="mx-auto h-7 w-7 text-accent" name="sparkle" />
          <p className="mt-2 text-sm font-semibold">Add something worth saving for.</p>
          <p className="mt-1 text-xs text-muted">
            Monara will estimate the monthly pace from confirmed records.
          </p>
        </div>
      )}
      {plan.completed.length > 0 && (
        <p className="mt-4 text-xs font-semibold text-muted">Completed · {plan.completed.length}</p>
      )}

      {editing !== undefined && (
        <GoalEditor
          goal={editing}
          onClose={() => setEditing(undefined)}
          onSave={save}
          pending={pending}
          today={today}
        />
      )}
      {deleting && (
        <ModalDialog labelledBy="delete-goal-title" onClose={() => setDeleting(null)}>
          <div className="space-y-4 p-5">
            <h2 className="text-xl font-bold" id="delete-goal-title">
              Delete {deleting.name}?
            </h2>
            <p className="text-sm text-muted">This removes the goal, not any transactions.</p>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button onPress={() => setDeleting(null)} variant="secondary">
                Cancel
              </Button>
              <Button isDisabled={pending} onPress={remove} variant="danger">
                {pending ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </ModalDialog>
      )}
    </section>
  );
}
