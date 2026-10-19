"use client";

import type { Category, FinancialInsights } from "@monara/contracts";
import { Button, Card, Chip, ProgressBar } from "@monara/ui";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useAmountDisplay } from "@/components/app-session-context";

import { BillCalendar } from "@/components/bill-calendar";
import { BrandMark } from "@/components/brand-mark";
import { BudgetDetails } from "@/components/budget-details";
import budgetStyles from "@/components/budgets-screen.module.css";
import { CategorySpendingGuide } from "@/components/category-spending-guide";
import { CategoryAvatar } from "@/components/category-symbol";
import { type CreateDemoBudgetInput, DemoBudgetCreator } from "@/components/demo-budget-creator";
import { type DemoBudgetChanges, DemoBudgetEditor } from "@/components/demo-budget-editor";
import { Icon } from "@/components/icon";
import { MonthSelector } from "@/components/month-selector";
import { RecurringBillSuggestion } from "@/components/recurring-bill-suggestion";
import { useMerchantLogo } from "@/components/use-brand-logo";
import { SectionTitle } from "@/components/visual";
import { summarizeBudgetPeriod } from "@/data/budget-period-model";
import { categoryColor, categoryIcon } from "@/data/category-style";
import {
  type Budget,
  budgetUsage,
  daysBetween,
  demoMonth,
  demoToday,
  formatDay,
  formatMonth,
  type RecurringBill,
  type Transaction,
} from "@/data/demo-ledger";

const fillByState = {
  "on-track": "bg-accent",
  warning: "bg-[#b37b15]",
  "at-limit": "bg-[#b37b15]",
  over: "bg-danger",
} as const;

const labelByState = {
  "on-track": "On track",
  warning: "Near limit",
  "at-limit": "At limit",
  over: "Over budget",
} as const;

const textByState = {
  "on-track": "text-muted",
  warning: "text-warning-soft-foreground",
  "at-limit": "text-warning-soft-foreground",
  over: "text-danger",
} as const;

function BudgetProgress({
  percent,
  elapsedPercent,
  label,
  color,
  state = "on-track",
  periodLabel = "period",
}: {
  percent: number;
  elapsedPercent?: number;
  label: string;
  color?: string;
  state?: "on-track" | "warning" | "at-limit" | "over";
  periodLabel?: string;
}) {
  return (
    <div className="relative">
      <ProgressBar
        aria-label={label}
        aria-valuetext={`${percent}% used${elapsedPercent === undefined ? "" : `; ${elapsedPercent}% of the ${periodLabel} elapsed`}`}
        value={Math.min(percent, 100)}
      >
        <ProgressBar.Track className="h-2 bg-surface-tertiary">
          <ProgressBar.Fill
            className={state === "on-track" && color ? "" : fillByState[state]}
            style={state === "on-track" && color ? { backgroundColor: color } : undefined}
          />
        </ProgressBar.Track>
      </ProgressBar>
      {elapsedPercent === undefined ? null : (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
          style={{ left: `${elapsedPercent}%` }}
        />
      )}
    </div>
  );
}

function BudgetRow({
  budget,
  transactions,
  month,
  index,
  onEdit,
  today,
}: {
  budget: Budget;
  transactions: Transaction[];
  month: string;
  index: number;
  onEdit?: () => void;
  today: string;
}) {
  const { formatRupiah } = useAmountDisplay();
  const usage = budgetUsage(transactions, budget, month, today);
  const color = categoryColor(budget.category, index);
  const descriptionId = `budget-${budget.id}-summary`;
  const description = usage.periodStartsOn
    ? `${formatRupiah(usage.used)} of ${formatRupiah(usage.limit)} spent. ${formatRupiah(usage.remaining < 0n ? -usage.remaining : usage.remaining)} ${usage.remaining < 0n ? "over" : "left"}. ${formatDay(usage.periodStartsOn)} to ${formatDay(usage.periodEndsOn ?? usage.periodStartsOn)}.`
    : `${formatRupiah(budget.limit)} limit. ${budget.startsOn ? `Starts ${formatDay(budget.startsOn)}.` : "Not started yet."}`;
  if (usage.periodStartsOn === null)
    return (
      <li>
        <Button
          aria-describedby={descriptionId}
          aria-label={`View ${budget.category} budget details`}
          className={budgetStyles.budgetRow}
          onPress={onEdit}
          variant="ghost"
        >
          <span className="sr-only" id={descriptionId}>
            {description}
          </span>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere]">
              {budget.category}
            </h3>
            <strong className="text-sm tabular-nums">{formatRupiah(budget.limit)}</strong>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">
              Starts {budget.startsOn ? formatDay(budget.startsOn) : "later"}
            </p>
            <Icon className="h-4 w-4 shrink-0 text-muted" name="chevron-right" />
          </div>
        </Button>
      </li>
    );
  return (
    <li>
      <Button
        aria-describedby={descriptionId}
        aria-label={`View ${budget.category} budget details`}
        className={budgetStyles.budgetRow}
        onPress={onEdit}
        variant="ghost"
      >
        <span className="sr-only" id={descriptionId}>
          {description}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold [overflow-wrap:anywhere]">
              <CategoryAvatar
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-secondary"
                icon={budget.icon}
                iconClassName="h-4 w-4"
                name={budget.category}
                size={36}
                style={{ color }}
              />
              {budget.category}
            </h3>
            <span className={`text-xs font-medium ${textByState[usage.state]}`}>
              {labelByState[usage.state]}
            </span>
          </div>
          <div className="mt-3">
            <BudgetProgress
              color={color}
              label={`${budget.category} budget used`}
              percent={usage.percent}
              state={usage.state}
            />
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-2 text-xs tabular-nums">
            <p className="min-w-0 text-muted [overflow-wrap:anywhere]">
              <span className="font-medium text-foreground">{formatRupiah(usage.used)}</span> of{" "}
              {formatRupiah(usage.limit)} spent · {usage.percent}%
            </p>
            <p
              className={`min-w-0 text-sm font-bold [overflow-wrap:anywhere] ${usage.state === "over" ? "text-danger" : "text-foreground"}`}
            >
              {usage.state === "over"
                ? `${formatRupiah(-usage.remaining)} over`
                : `${formatRupiah(usage.remaining)} left`}
            </p>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">
              {usage.periodStartsOn && usage.periodEndsOn
                ? `${formatDay(usage.periodStartsOn)} – ${formatDay(usage.periodEndsOn)}`
                : "Not started yet"}
            </p>
            <Icon className="h-4 w-4 shrink-0 text-muted" name="chevron-right" />
          </div>
        </div>
      </Button>
    </li>
  );
}

function BillRow({ bill, today }: { bill: RecurringBill; today: string }) {
  const { formatRupiah } = useAmountDisplay();
  const daysUntil = daysBetween(today, bill.nextDue);
  const brand = useMerchantLogo(bill.merchant);
  return (
    <li className="py-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold [overflow-wrap:anywhere]">
            {brand ? (
              <BrandMark brand={brand} size={36} />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-soft-foreground">
                <Icon
                  className="h-4 w-4"
                  name={
                    categoryIcon(bill.merchant) === "dot" ? "bills" : categoryIcon(bill.merchant)
                  }
                />
              </span>
            )}
            {bill.merchant}
          </h3>
          <p className="min-w-0 text-sm font-semibold tabular-nums [overflow-wrap:anywhere]">
            {formatRupiah(bill.expectedAmount)}
          </p>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span>Monthly · due {formatDay(bill.nextDue)}</span>
          {daysUntil < 0 ? (
            <Chip color="danger" size="sm" variant="soft">
              Overdue · {Math.abs(daysUntil)} {daysUntil === -1 ? "day" : "days"}
            </Chip>
          ) : null}
          {daysUntil >= 0 && daysUntil <= 3 ? (
            <Chip color="warning" size="sm" variant="soft">
              {daysUntil === 0
                ? "Due today"
                : `In ${daysUntil} ${daysUntil === 1 ? "day" : "days"}`}
            </Chip>
          ) : null}
        </div>
        {bill.cancellationUrl ? (
          <a
            className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-link underline-offset-2 hover:underline"
            href={bill.cancellationUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            How to cancel
            <Icon className="h-3 w-3" name="external" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : null}
      </div>
    </li>
  );
}

type BudgetSummary = ReturnType<typeof summarizeBudgetPeriod>;

function BudgetGauge({
  used,
  elapsed,
  over,
  cadence,
}: {
  used: number;
  elapsed?: number;
  over: boolean;
  cadence: Budget["cadence"];
}) {
  const angle = Math.PI * (1 - Math.min(elapsed ?? 0, 100) / 100);
  // Rounded coordinates keep the server and browser render identical.
  const at = (radius: number) => ({
    x: (100 + Math.cos(angle) * radius).toFixed(2),
    y: (100 - Math.sin(angle) * radius).toFixed(2),
  });
  const inner = at(66);
  const outer = at(92);
  const stroke = over ? "var(--danger)" : "var(--accent)";
  return (
    <figure className="w-24 shrink-0 sm:w-28">
      <svg
        aria-label={`${used}% of category budgets used${elapsed === undefined ? "" : `; needle shows ${elapsed}% of the budget ${cadence === "weekly" ? "week" : "month"} elapsed`}`}
        className="w-full"
        role="img"
        viewBox="0 0 200 108"
      >
        <path
          d="M20 100a80 80 0 0 1 160 0"
          fill="none"
          stroke="var(--surface-tertiary)"
          strokeLinecap="round"
          strokeWidth="12"
        />
        <path
          d="M20 100a80 80 0 0 1 160 0"
          fill="none"
          pathLength={100}
          stroke={stroke}
          strokeDasharray={`${Math.min(used, 100)} 100`}
          strokeLinecap="round"
          strokeWidth="12"
        />
        {elapsed === undefined ? null : (
          <line
            stroke="var(--foreground)"
            strokeLinecap="round"
            strokeWidth="3"
            x1={inner.x}
            x2={outer.x}
            y1={inner.y}
            y2={outer.y}
          />
        )}
        <text
          fill="var(--foreground)"
          fontSize="32"
          fontWeight="600"
          textAnchor="middle"
          x="100"
          y="98"
        >
          {used > 999 ? "999%+" : `${used}%`}
        </text>
      </svg>
      <figcaption className="mt-1 text-center text-xs text-muted">Used</figcaption>
    </figure>
  );
}

function BudgetSummaryProgress({
  summary,
  elapsedPercent,
  cadence,
}: {
  summary: BudgetSummary;
  elapsedPercent?: number;
  cadence: Budget["cadence"];
}) {
  const state =
    summary.totalUsed > summary.totalLimit
      ? "over"
      : summary.totalLimit > 0n && summary.totalUsed === summary.totalLimit
        ? "at-limit"
        : "on-track";
  return (
    <div className="mt-4">
      <BudgetProgress
        elapsedPercent={elapsedPercent}
        label={`${cadence === "weekly" ? "Weekly" : "Monthly"} category budgets used`}
        periodLabel={cadence === "weekly" ? "budget week" : "budget month"}
        percent={summary.usedPercent}
        state={state}
      />
      <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted tabular-nums">
        <span>{summary.usedPercent}% of budgets used</span>
        {elapsedPercent !== undefined && <span>Time elapsed · {elapsedPercent}%</span>}
      </div>
    </div>
  );
}

function BudgetSummaryCard({
  budgets,
  summary,
  cadence,
  onCreate,
}: {
  budgets: Budget[];
  summary: BudgetSummary;
  cadence: Budget["cadence"];
  onCreate: () => void;
}) {
  const { formatRupiah } = useAmountDisplay();
  const elapsedPercent = summary.elapsedPercent;
  if (budgets.length === 0)
    return (
      <Card className="block min-w-0 gap-0 rounded-2xl border border-border bg-surface-secondary p-5">
        <h2 className="text-base font-semibold">
          {cadence === "weekly" ? "Weekly" : "Monthly"} budgets
        </h2>
        <Button className="mt-4 min-h-11 rounded-full" onPress={onCreate} variant="secondary">
          <Icon className="h-4 w-4" name="plus" />
          Add {cadence} budget
        </Button>
      </Card>
    );
  return (
    <Card className="block min-w-0 gap-0 rounded-2xl border border-border p-5 sm:p-6">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-muted">
            {cadence === "weekly" ? "Weekly budgets remaining" : "Monthly budgets remaining"}
          </h2>
          <p className="mt-2 text-3xl font-extrabold leading-tight tracking-[-0.03em] tabular-nums [overflow-wrap:anywhere] sm:text-4xl">
            {formatRupiah(summary.remaining)}
          </p>
        </div>
        <BudgetGauge
          cadence={cadence}
          elapsed={elapsedPercent}
          over={summary.overBudget > BigInt(0)}
          used={summary.usedPercent}
        />
      </div>
      <p className="mt-3 text-xs leading-5 text-muted">
        {summary.sharedPeriod
          ? `${formatDay(summary.sharedPeriod.startsOn)} – ${formatDay(summary.sharedPeriod.endsOn)}`
          : summary.activeCount > 0
            ? "Different reset dates"
            : "Not started yet"}
      </p>
      <dl className="mt-5 grid grid-cols-2 gap-4">
        <div className="min-w-0">
          <dt className="text-xs text-muted">Spent</dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums [overflow-wrap:anywhere]">
            {formatRupiah(summary.totalUsed)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted">Total limits</dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums [overflow-wrap:anywhere]">
            {formatRupiah(summary.totalLimit)}
          </dd>
        </div>
      </dl>
      <details className="group mt-3 text-sm text-muted">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg font-medium focus-visible:outline-2 focus-visible:outline-focus">
          Details
          <Icon
            className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
            name="chevron-down"
          />
        </summary>
        <BudgetSummaryProgress
          cadence={cadence}
          elapsedPercent={elapsedPercent}
          summary={summary}
        />
      </details>
      {summary.overBudget > BigInt(0) ? (
        <div className="mt-4 rounded-xl bg-warning-soft p-3 text-sm leading-6 text-warning-soft-foreground">
          <p>
            <span className="font-semibold tabular-nums">
              {formatRupiah(summary.overBudget)} over
            </span>{" "}
            across categories.
          </p>
          <p className="mt-1">Review spending or adjust a category limit.</p>
        </div>
      ) : null}
    </Card>
  );
}

function CategoryBudgets({
  transactions,
  budgets,
  month,
  onOpenBudget,
  today,
  onCreate,
  cadence,
}: {
  transactions: Transaction[];
  budgets: Budget[];
  month: string;
  cadence: Budget["cadence"];
  onOpenBudget: (budget: Budget) => void;
  today: string;
  onCreate: () => void;
}) {
  return (
    <section aria-labelledby={`${cadence}-category-budgets`} className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold" id={`${cadence}-category-budgets`}>
          Categories <span className="ml-1 text-xs font-normal text-muted">{budgets.length}</span>
        </h3>
        <Button
          aria-label={`Add ${cadence} budget`}
          className="min-h-11 rounded-full px-4 text-sm"
          onPress={onCreate}
          variant="secondary"
        >
          <Icon className="h-4 w-4" name="plus" />
          Add
        </Button>
      </div>
      <Card className={`${budgetStyles.categoryCard} mt-2`}>
        <ul className={budgetStyles.budgetList}>
          {budgets.map((budget, index) => (
            <BudgetRow
              budget={budget}
              index={index}
              key={budget.id}
              month={month}
              transactions={transactions}
              today={today}
              onEdit={() => onOpenBudget(budget)}
            />
          ))}
        </ul>
      </Card>
    </section>
  );
}

function BudgetDetailsPanel({
  budget,
  transactions,
  month,
  today,
  onClose,
  onEdit,
  onDelete,
}: {
  budget?: Budget;
  transactions: Transaction[];
  month: string;
  today: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete?: (id: string) => void;
}) {
  if (!budget) return null;
  const usage = budgetUsage(transactions, budget, month, today);
  return (
    <BudgetDetails
      record={{
        name: budget.backend?.name ?? budget.category,
        category: budget.category,
        icon: budget.icon,
        cadence: budget.cadence,
        limit: BigInt(budget.limit),
        warningPercent: budget.warningPercent,
        startsOn: budget.startsOn,
        status: usage.periodStartsOn ? labelByState[usage.state] : "Not started",
        usage: usage.periodStartsOn ? usage : undefined,
      }}
      onClose={onClose}
      onEdit={onEdit}
      onDelete={
        onDelete
          ? () => {
              onClose();
              onDelete(budget.id);
            }
          : undefined
      }
    />
  );
}

function RecurringBills({
  active,
  suggested,
  today,
  onConfirmBill,
  onDismissBill,
}: {
  active: RecurringBill[];
  suggested: RecurringBill[];
  today: string;
  onConfirmBill: (id: string) => void;
  onDismissBill: (id: string) => void;
}) {
  return (
    <section aria-labelledby="recurring-bills" className="mt-5">
      <SectionTitle
        id="recurring-bills"
        meta={`${active.length} tracked`}
        title="Recurring bills"
      />
      <Card className="mt-2 block min-w-0 gap-0 rounded-2xl border border-border px-5 py-1">
        {active.length > 0 ? (
          <ul className="divide-y divide-separator">
            {active.map((bill) => (
              <BillRow bill={bill} key={bill.id} today={today} />
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-muted">No recurring bills yet.</p>
        )}
      </Card>
      {suggested.map((bill) => (
        <div className="mt-3" key={bill.id}>
          <RecurringBillSuggestion
            bill={bill}
            onConfirm={onConfirmBill}
            onDismiss={onDismissBill}
          />
        </div>
      ))}
    </section>
  );
}

export function BudgetsScreen({
  transactions,
  budgets,
  bills,
  month = demoMonth,
  today = demoToday,
  management,
  insights,
  demo = true,
  setMonth,
  onConfirmBill,
  onDismissBill,
  onEditBudget,
  onRequestEditBudget,
  onRequestDeleteBudget,
  onCreateBudget,
  onRequestCreateBudget,
  demoCategories,
}: {
  transactions: Transaction[];
  budgets: Budget[];
  bills: RecurringBill[];
  month?: string;
  today?: string;
  management?: ReactNode;
  insights?: FinancialInsights;
  demo?: boolean;
  setMonth?: (month: string) => void;
  onConfirmBill: (id: string) => void;
  onDismissBill: (id: string) => void;
  onEditBudget?: (budgetId: string, changes: DemoBudgetChanges) => void;
  onRequestEditBudget?: (budgetId: string) => void;
  onRequestDeleteBudget?: (budgetId: string) => void;
  onCreateBudget?: (input: CreateDemoBudgetInput) => void;
  onRequestCreateBudget?: (cadence: Budget["cadence"]) => void;
  demoCategories?: Category[];
}) {
  const periods = (["weekly", "monthly"] as const).map((cadence) => ({
    cadence,
    summary: summarizeBudgetPeriod(transactions, budgets, cadence, month, today),
  }));
  const monthly = periods[1].summary;
  const [editing, setEditing] = useState<Budget | null>(null);
  const [creating, setCreating] = useState<Budget["cadence"] | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    message: string;
    category?: string;
    undo?: { budgetId: string; before: DemoBudgetChanges; after: DemoBudgetChanges };
    error?: string;
  } | null>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!feedback) return;
    feedbackRef.current?.scrollIntoView({ block: "center" });
    feedbackRef.current?.focus({ preventScroll: true });
  }, [feedback]);
  const saveDemoBudget = (budgetId: string, changes: DemoBudgetChanges) => {
    const current = budgets.find((budget) => budget.id === budgetId);
    if (!current || !onEditBudget)
      throw new Error(
        "This budget is no longer available. Close the form and choose another budget.",
      );
    onEditBudget(budgetId, changes);
    setFeedback({
      message: `${current.category} budget updated.`,
      category: current.category,
      undo: {
        budgetId,
        before: {
          cadence: current.cadence,
          limit: current.limit,
          startsOn: current.startsOn ?? `${today.slice(0, 7)}-01`,
          warningPercent: current.warningPercent,
          icon: current.icon,
        },
        after: changes,
      },
    });
  };
  const undoDemoBudget = () => {
    if (!feedback?.undo || !onEditBudget) return;
    const { budgetId, before, after } = feedback.undo;
    const current = budgets.find((budget) => budget.id === budgetId);
    if (
      !current ||
      current.cadence !== after.cadence ||
      current.limit !== after.limit ||
      current.startsOn !== after.startsOn ||
      current.warningPercent !== after.warningPercent ||
      current.icon !== after.icon
    ) {
      setFeedback({
        message: "This budget changed again. Open its latest details before making another change.",
        category: feedback.category,
      });
      return;
    }
    try {
      onEditBudget(budgetId, before);
      setFeedback({
        message: "Budget changes undone.",
        category: feedback.category,
      });
    } catch {
      setFeedback({
        ...feedback,
        error:
          "We couldn’t undo that change. Your current budget is still in place. Try again or open its details.",
      });
    }
  };
  const detail = budgets.find((budget) => budget.id === detailId);
  const editDetail = () => {
    if (!detail) return;
    setDetailId(null);
    if (onRequestEditBudget) onRequestEditBudget(detail.id);
    else setEditing(detail);
  };
  const suggested = bills.filter((bill) => bill.status === "suggested");
  const active = bills
    .filter((bill) => bill.status === "active")
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  const showBills = demo || bills.length > 0;

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[32px] font-extrabold tracking-[-0.04em]">Budgets</h1>
        </div>
        {setMonth ? (
          <MonthSelector currentMonth={today.slice(0, 7)} month={month} onChange={setMonth} />
        ) : (
          <p className="text-xs font-semibold text-muted sm:text-sm">{formatMonth(month)}</p>
        )}
      </div>

      {feedback && (
        <div
          className="mt-4 rounded-2xl border border-border bg-surface p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          ref={feedbackRef}
          role="status"
          tabIndex={-1}
        >
          <p className="text-sm leading-6">{feedback.message}</p>
          {feedback.error && (
            <p className="mt-2 text-sm text-danger" role="alert">
              {feedback.error}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {feedback.undo && (
              <Button
                className="min-h-11 rounded-full"
                onPress={undoDemoBudget}
                variant="secondary"
              >
                Undo change
              </Button>
            )}
            {feedback.category && (
              <Button
                className="min-h-11 rounded-full"
                onPress={() => {
                  const budget = budgets.find((item) => item.category === feedback.category);
                  if (budget) setDetailId(budget.id);
                }}
                variant="ghost"
              >
                View budget
              </Button>
            )}
            <Button
              aria-label="Dismiss budget update"
              className="min-h-11 rounded-full"
              onPress={() => setFeedback(null)}
              variant="ghost"
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <div
        className={`mt-4 grid min-w-0 gap-5 ${showBills ? "lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" : ""} lg:gap-6`}
      >
        <div className="min-w-0">
          <div className={budgetStyles.periodGrid}>
            {periods.map(({ cadence, summary }) => (
              <section
                className="min-w-0"
                aria-label={`${cadence === "weekly" ? "Weekly" : "Monthly"} budgets`}
                key={cadence}
              >
                <BudgetSummaryCard
                  budgets={summary.budgets}
                  cadence={cadence}
                  summary={summary}
                  onCreate={() =>
                    onRequestCreateBudget ? onRequestCreateBudget(cadence) : setCreating(cadence)
                  }
                />
                {summary.budgets.length > 0 && (
                  <CategoryBudgets
                    cadence={cadence}
                    budgets={summary.budgets}
                    month={month}
                    transactions={transactions}
                    today={today}
                    onOpenBudget={(budget) => setDetailId(budget.id)}
                    onCreate={() =>
                      onRequestCreateBudget ? onRequestCreateBudget(cadence) : setCreating(cadence)
                    }
                  />
                )}
              </section>
            ))}
          </div>
          <CategorySpendingGuide
            budgetIds={monthly.budgets.map((budget) => budget.id)}
            insights={insights}
            month={month}
            today={today}
          />
          {management}
        </div>
        {showBills && (
          <div className="min-w-0">
            <BillCalendar bills={active} key={month} month={month} today={today} />
            <RecurringBills
              active={active}
              onConfirmBill={onConfirmBill}
              onDismissBill={onDismissBill}
              suggested={suggested}
              today={today}
            />
          </div>
        )}
      </div>
      <BudgetDetailsPanel
        budget={detail}
        transactions={transactions}
        month={month}
        today={today}
        onClose={() => setDetailId(null)}
        onEdit={editDetail}
        onDelete={onRequestDeleteBudget}
      />
      {editing && onEditBudget && (
        <DemoBudgetEditor
          budget={editing}
          key={editing.id}
          onClose={() => setEditing(null)}
          onSave={saveDemoBudget}
          today={today}
          transactions={transactions}
        />
      )}
      {creating && onCreateBudget && (
        <DemoBudgetCreator
          budgets={budgets}
          initialCadence={creating}
          transactions={transactions}
          today={today}
          onSave={(input) => {
            onCreateBudget(input);
            setFeedback({
              message: `${input.category} budget added.`,
              category: input.category,
            });
          }}
          onClose={() => setCreating(null)}
          demoCategories={demoCategories}
        />
      )}
    </div>
  );
}
