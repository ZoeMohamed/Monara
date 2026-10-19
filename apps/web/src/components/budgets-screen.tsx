"use client";

import type { Category, FinancialInsights } from "@monara/contracts";
import { Button, Card, Chip, ProgressBar } from "@monara/ui";
import { type ReactNode, useState } from "react";
import { useAmountDisplay } from "@/components/app-session-context";

import { BillCalendar } from "@/components/bill-calendar";
import { BrandMark } from "@/components/brand-mark";
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

function BudgetRowAction({
  budget,
  onEdit,
  onDelete,
  description,
  children,
}: {
  budget: Budget;
  onEdit?: () => void;
  onDelete?: () => void;
  description: string;
  children: ReactNode;
}) {
  const descriptionId = `budget-${budget.id}-summary`;
  return (
    <li>
      <div className="flex items-center gap-1">
        <Button
          aria-describedby={descriptionId}
          aria-label={`Edit ${budget.category} budget`}
          className={`${budgetStyles.budgetRow} flex-1`}
          onPress={onEdit}
          variant="ghost"
        >
          <span className="sr-only" id={descriptionId}>
            {description}
          </span>
          {children}
        </Button>
        {onDelete && (
          <Button
            aria-label={`Delete ${budget.category} budget`}
            className="h-10 w-10 shrink-0 rounded-full text-muted"
            isIconOnly
            onPress={onDelete}
            variant="ghost"
          >
            <Icon className="h-4 w-4" name="delete" />
          </Button>
        )}
      </div>
    </li>
  );
}

function UpcomingBudgetContent({ budget }: { budget: Budget }) {
  const { formatRupiah } = useAmountDisplay();
  return (
    <>
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
    </>
  );
}

function ActiveBudgetContent({
  budget,
  usage,
  color,
  today,
}: {
  budget: Budget;
  usage: ReturnType<typeof budgetUsage>;
  color: string;
  today: string;
}) {
  const { formatRupiah } = useAmountDisplay();
  const over = usage.state === "over";
  const remaining = over ? -usage.remaining : usage.remaining;
  return (
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
          className={`min-w-0 text-sm font-bold [overflow-wrap:anywhere] ${over ? "text-danger" : "text-foreground"}`}
        >
          {formatRupiah(remaining)} {over ? "over" : "left"}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {formatDay(usage.periodStartsOn ?? budget.startsOn ?? today)} –{" "}
          {formatDay(usage.periodEndsOn ?? usage.periodStartsOn ?? budget.startsOn ?? today)}
        </p>
        <Icon className="h-4 w-4 shrink-0 text-muted" name="chevron-right" />
      </div>
    </div>
  );
}

function BudgetRow({
  budget,
  transactions,
  month,
  index,
  onEdit,
  onDelete,
  today,
}: {
  budget: Budget;
  transactions: Transaction[];
  month: string;
  index: number;
  onEdit?: () => void;
  onDelete?: () => void;
  today: string;
}) {
  const { formatRupiah } = useAmountDisplay();
  const usage = budgetUsage(transactions, budget, month, today);
  const color = categoryColor(budget.category, index);
  const description = usage.periodStartsOn
    ? `${formatRupiah(usage.used)} of ${formatRupiah(usage.limit)} spent. ${formatRupiah(usage.remaining < 0n ? -usage.remaining : usage.remaining)} ${usage.remaining < 0n ? "over" : "left"}. ${formatDay(usage.periodStartsOn)} to ${formatDay(usage.periodEndsOn ?? usage.periodStartsOn)}.`
    : `${formatRupiah(budget.limit)} limit. ${budget.startsOn ? `Starts ${formatDay(budget.startsOn)}.` : "Not started yet."}`;
  if (usage.periodStartsOn === null)
    return (
      <BudgetRowAction
        budget={budget}
        description={description}
        onDelete={onDelete}
        onEdit={onEdit}
      >
        <UpcomingBudgetContent budget={budget} />
      </BudgetRowAction>
    );
  return (
    <BudgetRowAction budget={budget} description={description} onDelete={onDelete} onEdit={onEdit}>
      <ActiveBudgetContent budget={budget} color={color} today={today} usage={usage} />
    </BudgetRowAction>
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

function BudgetSummaryCard({
  budgets,
  summary,
  cadence,
}: {
  budgets: Budget[];
  summary: BudgetSummary;
  cadence: Budget["cadence"];
}) {
  const { formatRupiah } = useAmountDisplay();
  const elapsedPercent = summary.elapsedPercent;
  if (budgets.length === 0)
    return (
      <div className="px-5 py-4">
        <h2 className="text-base font-semibold">
          {cadence === "weekly" ? "Weekly" : "Monthly"} budgets
        </h2>
        <p className="mt-1 text-sm text-muted">Set a limit to start tracking this period.</p>
      </div>
    );
  return (
    <div className="px-5 pb-2 pt-5 sm:px-6">
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
    </div>
  );
}

function CategoryBudgets({
  transactions,
  budgets,
  month,
  onOpenBudget,
  onDeleteBudget,
  today,
  onCreate,
  cadence,
}: {
  transactions: Transaction[];
  budgets: Budget[];
  month: string;
  cadence: Budget["cadence"];
  onOpenBudget: (budget: Budget) => void;
  onDeleteBudget?: (budget: Budget) => void;
  today: string;
  onCreate: () => void;
}) {
  return (
    <section
      aria-labelledby={`${cadence}-category-budgets`}
      className={budgetStyles.categorySection}
    >
      <div className="flex items-baseline justify-between gap-3 px-5 pb-2 pt-4">
        <h3 className="text-sm font-semibold" id={`${cadence}-category-budgets`}>
          Categories
        </h3>
        <span className="text-xs text-muted">{budgets.length}</span>
      </div>
      {budgets.length > 0 && (
        <ul className={`${budgetStyles.budgetList} px-2`}>
          {budgets.map((budget, index) => (
            <BudgetRow
              budget={budget}
              index={index}
              key={budget.id}
              month={month}
              transactions={transactions}
              today={today}
              onEdit={() => onOpenBudget(budget)}
              onDelete={onDeleteBudget ? () => onDeleteBudget(budget) : undefined}
            />
          ))}
        </ul>
      )}
      <div className="border-t border-separator p-3">
        <Button
          aria-label={`Add ${cadence} budget`}
          className="min-h-11 w-full rounded-full text-sm"
          onPress={onCreate}
          variant="secondary"
        >
          <Icon className="h-4 w-4" name="plus" />
          Add {cadence} budget
        </Button>
      </div>
    </section>
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
  const [feedback, setFeedback] = useState<{
    message: string;
    category?: string;
    undo?: { budgetId: string; before: DemoBudgetChanges; after: DemoBudgetChanges };
    error?: string;
  } | null>(null);
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
        message: "This budget changed again. Open it to review the latest settings.",
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
          "We couldn’t undo that change. Your current budget is still in place. Try again or edit it.",
      });
    }
  };
  const openBudget = (budget: Budget) => {
    if (onRequestEditBudget) onRequestEditBudget(budget.id);
    else setEditing(budget);
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
        <div className={budgetStyles.budgetToast} role="status">
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
              <Card
                className={budgetStyles.periodGroup}
                aria-label={`${cadence === "weekly" ? "Weekly" : "Monthly"} budgets`}
                key={cadence}
              >
                <BudgetSummaryCard budgets={summary.budgets} cadence={cadence} summary={summary} />
                <CategoryBudgets
                  cadence={cadence}
                  budgets={summary.budgets}
                  month={month}
                  transactions={transactions}
                  today={today}
                  onOpenBudget={openBudget}
                  onDeleteBudget={
                    onRequestDeleteBudget ? (budget) => onRequestDeleteBudget(budget.id) : undefined
                  }
                  onCreate={() =>
                    onRequestCreateBudget ? onRequestCreateBudget(cadence) : setCreating(cadence)
                  }
                />
              </Card>
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
