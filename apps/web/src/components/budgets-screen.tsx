"use client";

import type { Category } from "@monara/contracts";
import { Button, Card, Chip, ProgressBar } from "@monara/ui";
import { type ReactNode, useState } from "react";
import { useAmountDisplay } from "@/components/app-session-context";

import { BillCalendar } from "@/components/bill-calendar";
import { BrandMark } from "@/components/brand-mark";
import { BudgetDetails } from "@/components/budget-details";
import budgetStyles from "@/components/budgets-screen.module.css";
import { CategoryAvatar } from "@/components/category-symbol";
import { type CreateDemoBudgetInput, DemoBudgetCreator } from "@/components/demo-budget-creator";
import { type DemoBudgetChanges, DemoBudgetEditor } from "@/components/demo-budget-editor";
import { Icon } from "@/components/icon";
import { MonthSelector } from "@/components/month-selector";
import { RecurringBillSuggestion } from "@/components/recurring-bill-suggestion";
import { useMerchantLogo } from "@/components/use-brand-logo";
import { SectionTitle } from "@/components/visual";
import { categoryColor, categoryIcon } from "@/data/category-style";
import {
  type Budget,
  budgetUsage,
  daysBetween,
  daysInMonth,
  demoMonth,
  demoToday,
  formatDay,
  formatMonth,
  type RecurringBill,
  safeToSpendToday,
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
}: {
  percent: number;
  elapsedPercent?: number;
  label: string;
  color?: string;
  state?: "on-track" | "warning" | "at-limit" | "over";
}) {
  return (
    <div className="relative">
      <ProgressBar
        aria-label={label}
        aria-valuetext={`${percent}% used${elapsedPercent === undefined ? "" : `; ${elapsedPercent}% of the month elapsed`}`}
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

function RowAction({ editing }: { editing: boolean }) {
  return editing ? (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent">
      <Icon className="h-3.5 w-3.5" name="compose" />
      Edit
    </span>
  ) : (
    <Icon className="h-4 w-4 shrink-0 text-muted" name="chevron-right" />
  );
}

function BudgetRow({
  budget,
  transactions,
  month,
  index,
  onEdit,
  today,
  editing,
}: {
  budget: Budget;
  transactions: Transaction[];
  month: string;
  index: number;
  onEdit?: () => void;
  today: string;
  editing: boolean;
}) {
  const { formatRupiah } = useAmountDisplay();
  const usage = budgetUsage(transactions, budget, month, today);
  const color = categoryColor(budget.category, index);
  if (usage.periodStartsOn === null)
    return (
      <li>
        <Button
          aria-label={`${editing ? "Edit" : "View"} ${budget.category} budget${editing ? "" : " details"}`}
          className={budgetStyles.budgetRow}
          onPress={onEdit}
          variant="ghost"
        >
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
            <RowAction editing={editing} />
          </div>
        </Button>
      </li>
    );
  return (
    <li>
      <Button
        aria-label={`${editing ? "Edit" : "View"} ${budget.category} budget${editing ? "" : " details"}`}
        className={budgetStyles.budgetRow}
        onPress={onEdit}
        variant="ghost"
      >
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
            <RowAction editing={editing} />
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

function summarizeBudgets(
  transactions: Transaction[],
  budgets: Budget[],
  month: string,
  today: string,
) {
  let totalLimit = BigInt(0);
  let totalUsed = BigInt(0);
  let remaining = BigInt(0);
  let overBudget = BigInt(0);
  for (const budget of budgets) {
    const usage = budgetUsage(transactions, budget, month, today);
    if (usage.periodStartsOn === null) continue;
    totalLimit += usage.limit;
    totalUsed += usage.used;
    if (usage.remaining > BigInt(0)) remaining += usage.remaining;
    if (usage.remaining < BigInt(0)) overBudget -= usage.remaining;
  }
  const usedPercent = totalLimit > BigInt(0) ? Number((totalUsed * BigInt(100)) / totalLimit) : 0;
  let elapsedPercent = month < today.slice(0, 7) ? 100 : 0;
  if (month === today.slice(0, 7)) {
    elapsedPercent = Math.round((Number(today.slice(8, 10)) / daysInMonth(month)) * 100);
  }
  return { totalLimit, totalUsed, remaining, overBudget, usedPercent, elapsedPercent };
}

type BudgetSummary = ReturnType<typeof summarizeBudgets>;

function BudgetGauge({ used, elapsed, over }: { used: number; elapsed?: number; over: boolean }) {
  const angle = Math.PI * (1 - Math.min(elapsed ?? 0, 100) / 100);
  // Rounded coordinates keep the server and browser render identical.
  const at = (radius: number) => ({
    x: (100 + Math.cos(angle) * radius).toFixed(2),
    y: (100 - Math.sin(angle) * radius).toFixed(2),
  });
  const inner = at(66);
  const outer = at(92);
  const stroke = over
    ? "var(--danger)"
    : elapsed !== undefined && used > elapsed
      ? "#b37b15"
      : "var(--accent)";
  return (
    <figure className="w-32 shrink-0 sm:w-36">
      <svg
        aria-label={`${used}% of category budgets used${elapsed === undefined ? "" : `; needle shows ${elapsed}% of the month elapsed`}`}
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
          {used}%
        </text>
      </svg>
      <figcaption className="mt-1 text-center text-xs text-muted">Budgets used</figcaption>
    </figure>
  );
}

function BudgetSummaryProgress({
  summary,
  elapsedPercent,
}: {
  summary: BudgetSummary;
  elapsedPercent?: number;
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
        label="Total category budget used"
        percent={summary.usedPercent}
        state={state}
      />
      <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted tabular-nums">
        <span>{summary.usedPercent}% of budgets used</span>
        {elapsedPercent !== undefined && (
          <span>Needle / marker: {elapsedPercent}% of month elapsed</span>
        )}
      </div>
    </div>
  );
}

function DailyBudgetGuide({ safe }: { safe: ReturnType<typeof safeToSpendToday> }) {
  const { formatRupiah } = useAmountDisplay();
  return (
    <div className="mt-5 border-t border-separator pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium">Daily budget guide</p>
        <p className="text-sm font-semibold tabular-nums [overflow-wrap:anywhere]">
          {formatRupiah(safe.perDay)}
          <span className="font-normal text-muted"> / day</span>
        </p>
      </div>
      <p className="mt-1 text-xs text-muted">
        {formatRupiah(safe.remaining)} overall remaining ÷ {safe.daysLeft}{" "}
        {safe.daysLeft === 1 ? "day" : "days"} left, including today.
      </p>
      <p className="mt-1 text-xs text-muted">
        Total limits minus all confirmed expenses, with a minimum of Rp0.
      </p>
    </div>
  );
}

function BudgetSummaryCard({
  transactions,
  budgets,
  month,
  summary,
  today,
  monthlyOnly,
  calendarPeriods,
}: {
  transactions: Transaction[];
  budgets: Budget[];
  month: string;
  summary: BudgetSummary;
  today: string;
  monthlyOnly: boolean;
  calendarPeriods: boolean;
}) {
  const { formatRupiah } = useAmountDisplay();
  const currentMonth = month === today.slice(0, 7);
  const safe = safeToSpendToday(transactions, budgets, today);
  const elapsedPercent = currentMonth && calendarPeriods ? summary.elapsedPercent : undefined;
  return (
    <Card className="block min-w-0 gap-0 rounded-2xl border border-border p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-4">
        <div className="min-w-0 flex-1 basis-[13rem]">
          <h2 className="text-sm font-medium text-muted">
            {monthlyOnly ? "Monthly category budgets remaining" : "Remaining in category budgets"}
          </h2>
          <p className="mt-2 text-3xl font-extrabold leading-tight tracking-[-0.03em] tabular-nums [overflow-wrap:anywhere] sm:text-4xl">
            {formatRupiah(summary.remaining)}
          </p>
        </div>
        <BudgetGauge
          elapsed={elapsedPercent}
          over={summary.overBudget > BigInt(0)}
          used={summary.usedPercent}
        />
      </div>
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
      <BudgetSummaryProgress elapsedPercent={elapsedPercent} summary={summary} />
      {summary.overBudget > BigInt(0) ? (
        <p className="mt-4 text-sm text-danger">
          <span className="font-semibold tabular-nums">
            {formatRupiah(summary.overBudget)} over
          </span>{" "}
          across categories above their limits.
        </p>
      ) : null}
      {currentMonth && calendarPeriods ? <DailyBudgetGuide safe={safe} /> : null}
    </Card>
  );
}

function CategoryBudgets({
  transactions,
  budgets,
  month,
  onOpenBudget,
  onEditBudget,
  today,
  onCreate,
}: {
  transactions: Transaction[];
  budgets: Budget[];
  month: string;
  onOpenBudget: (budget: Budget) => void;
  onEditBudget: (budget: Budget) => void;
  today: string;
  onCreate: () => void;
}) {
  // Editing turns each row into a direct edit and reveals adding a budget in place.
  const [editing, setEditing] = useState(false);
  const empty = budgets.length === 0;
  return (
    <section aria-labelledby="category-budgets" className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle
          id="category-budgets"
          meta={`${budgets.length} ${budgets.length === 1 ? "category" : "categories"}`}
          title="By category"
        />
        {empty ? null : (
          <Button
            aria-pressed={editing}
            className="min-h-11 rounded-full px-4 text-sm"
            onPress={() => setEditing((value) => !value)}
            variant={editing ? "primary" : "secondary"}
          >
            {editing ? (
              "Done"
            ) : (
              <>
                <Icon className="h-4 w-4" name="compose" />
                Edit budgets
              </>
            )}
          </Button>
        )}
      </div>
      <Card className={`${budgetStyles.categoryCard} mt-2`}>
        {empty ? (
          <p className="px-5 pt-6 pb-3 text-center text-sm text-muted">No category budgets yet.</p>
        ) : (
          <ul className={budgetStyles.budgetList}>
            {budgets.map((budget, index) => (
              <BudgetRow
                budget={budget}
                editing={editing}
                index={index}
                key={budget.id}
                month={month}
                transactions={transactions}
                today={today}
                onEdit={() => (editing ? onEditBudget(budget) : onOpenBudget(budget))}
              />
            ))}
          </ul>
        )}
        {editing || empty ? (
          <Button className={budgetStyles.addRow} onPress={onCreate} variant="ghost">
            <Icon className="h-4 w-4" name="plus" />
            Add budget
          </Button>
        ) : null}
      </Card>
      <p className="mt-2 text-xs text-muted">
        Confirmed expenses only. Each budget follows its chosen start date.
      </p>
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
  demo?: boolean;
  setMonth?: (month: string) => void;
  onConfirmBill: (id: string) => void;
  onDismissBill: (id: string) => void;
  onEditBudget?: (budgetId: string, changes: DemoBudgetChanges) => void;
  onRequestEditBudget?: (budgetId: string) => void;
  onRequestDeleteBudget?: (budgetId: string) => void;
  onCreateBudget?: (input: CreateDemoBudgetInput) => void;
  onRequestCreateBudget?: () => void;
  demoCategories?: Category[];
}) {
  const summary = summarizeBudgets(transactions, budgets, month, today);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = budgets.find((budget) => budget.id === detailId);
  const editDetail = () => {
    if (!detail) return;
    setDetailId(null);
    if (onRequestEditBudget) onRequestEditBudget(detail.id);
    else setEditing(detail);
  };
  const calendarPeriods = budgets.every(
    (budget) => !budget.startsOn || budget.startsOn.endsWith("-01"),
  );
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

      <div
        className={`mt-4 grid min-w-0 gap-5 ${showBills ? "lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" : ""} lg:gap-6`}
      >
        <div className="min-w-0">
          <BudgetSummaryCard
            budgets={budgets}
            month={month}
            summary={summary}
            today={today}
            monthlyOnly={demo || Boolean(management)}
            calendarPeriods={calendarPeriods}
            transactions={transactions}
          />
          <CategoryBudgets
            budgets={budgets}
            month={month}
            transactions={transactions}
            today={today}
            onOpenBudget={(budget) => setDetailId(budget.id)}
            onEditBudget={(budget) => {
              if (onRequestEditBudget) onRequestEditBudget(budget.id);
              else setEditing(budget);
            }}
            onCreate={onRequestCreateBudget ?? (() => setCreating(true))}
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
          onSave={onEditBudget}
          today={today}
          transactions={transactions}
        />
      )}
      {creating && onCreateBudget && (
        <DemoBudgetCreator
          budgets={budgets}
          transactions={transactions}
          today={today}
          onSave={onCreateBudget}
          onClose={() => setCreating(false)}
          demoCategories={demoCategories}
        />
      )}
    </div>
  );
}
