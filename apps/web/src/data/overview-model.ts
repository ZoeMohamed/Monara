import { type Budget as BackendBudget, budgetPeriodForDate } from "@monara/contracts";
import {
  type Budget,
  budgetUsage,
  daysBetween,
  daysInMonth,
  demoSummary,
  demoToday,
  type RecurringBill,
  safeToSpendToday,
  type Transaction,
  transactionErrors,
} from "./demo-ledger";
import { financialMonth, monthComparison } from "./finance-analytics";

export type SceneTime = "morning" | "afternoon" | "evening" | "night";

// The device clock changes the greeting only, never the sample financial period.
export function sceneTime(hour: number): SceneTime {
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 20) return "evening";
  return "night";
}

const severity = { "on-track": 0, warning: 1, "at-limit": 2, over: 3 } as const;

// An untimed record was usually just logged, so it leads its day in the activity list.
const latestFirst = (a: Transaction, b: Transaction) =>
  `${b.date} ${b.time ?? "~"}`.localeCompare(`${a.date} ${a.time ?? "~"}`);

// The running month shows the latest records overall, so a new month never opens empty;
// a past month shows only its own. Future-dated and invalid records never appear.
function latestConfirmed(
  transactions: Transaction[],
  monthRecords: Transaction[],
  month: string,
  today: string,
) {
  const pool =
    month === today.slice(0, 7)
      ? transactions.filter(
          (item) =>
            item.status === "confirmed" &&
            (item.kind === "expense" || item.kind === "income") &&
            item.date !== null &&
            item.date <= today &&
            Object.keys(transactionErrors(item)).length === 0,
        )
      : monthRecords;
  return [...pool].sort(latestFirst).slice(0, 5);
}

type BudgetUsageItem = ReturnType<typeof budgetUsage> & { budget: Budget };

export type AttentionItem =
  | { kind: "bill-overdue"; bill: RecurringBill; days: number }
  | { kind: "bill-due"; bill: RecurringBill; days: number }
  | { kind: "budget"; usage: BudgetUsageItem }
  | { kind: "review"; count: number };

// What needs the User today, most urgent first. Only the running month has a "today".
function attentionItems(
  usage: BudgetUsageItem[],
  bills: RecurringBill[],
  pendingCount: number,
  today: string,
): AttentionItem[] {
  const active = bills
    .filter((bill) => bill.status === "active")
    .map((bill) => ({ bill, days: daysBetween(today, bill.nextDue) }))
    .sort((a, b) => a.days - b.days);
  const budgets = usage
    .filter((item) => item.state !== "on-track")
    .sort((a, b) => severity[b.state] - severity[a.state] || b.percent - a.percent);
  const overBudgets = budgets.filter((item) => item.state === "over");
  return [
    ...active
      .filter(({ days }) => days < 0)
      .map(({ bill, days }) => ({ kind: "bill-overdue" as const, bill, days: -days })),
    ...overBudgets.map((item) => ({ kind: "budget" as const, usage: item })),
    ...active
      .filter(({ days }) => days >= 0 && days <= 6)
      .map(({ bill, days }) => ({ kind: "bill-due" as const, bill, days })),
    ...budgets
      .filter((item) => item.state !== "over")
      .map((item) => ({ kind: "budget" as const, usage: item })),
    ...(pendingCount > 0 ? [{ kind: "review" as const, count: pendingCount }] : []),
  ];
}

// Plain facts from confirmed records. Forecasts and unusual-spending flags belong to the
// backend insight work and are never inferred here.
function monthFacts(transactions: Transaction[], month: string, today: string, spending: bigint) {
  const finance = financialMonth(transactions, month, today);
  const top = finance.categories[0];
  const expenses = demoSummary(transactions, month).confirmed.filter(
    (item) => item.kind === "expense",
  );
  const largest = expenses.reduce<Transaction | null>(
    (best, item) => (best === null || (item.amount ?? 0) > (best.amount ?? 0) ? item : best),
    null,
  );
  const currentMonth = today.slice(0, 7);
  const spendingThroughToday =
    month === currentMonth
      ? expenses
          .filter((item) => item.date !== null && item.date <= today)
          .reduce((total, item) => total + BigInt(item.amount ?? 0), BigInt(0))
      : spending;
  const daysCounted =
    month === currentMonth
      ? Number(today.slice(8, 10))
      : month < currentMonth
        ? daysInMonth(month)
        : 0;
  return {
    topCategory:
      top && spending > BigInt(0)
        ? { name: top.name, share: Math.round(Number((top.amount * BigInt(1000)) / spending) / 10) }
        : null,
    dailyAverage:
      daysCounted > 0 && spendingThroughToday > BigInt(0)
        ? spendingThroughToday / BigInt(daysCounted)
        : null,
    largest,
  };
}

function shiftDays(date: string, offset: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

// A weekly guide is a labelled allocation of monthly limits, never an invented budget.
// Count each covered monthly period together so fractions are rounded only once per period.
function monthlyWeekGuide(budgets: Budget[], dates: string[]): bigint {
  let guide = BigInt(0);
  for (const budget of budgets) {
    const periods = new Map<string, { days: number; length: number }>();
    for (const date of dates) {
      const period = budgetPeriodForDate(
        { cadence: budget.cadence, startsOn: budget.startsOn ?? `${date.slice(0, 7)}-01` },
        date,
      );
      if (!period) continue;
      const covered = periods.get(period.startsOn) ?? {
        days: 0,
        length: daysBetween(period.startsOn, period.endsOn) + 1,
      };
      covered.days += 1;
      periods.set(period.startsOn, covered);
    }
    for (const period of periods.values()) {
      guide += (BigInt(budget.limit) * BigInt(period.days)) / BigInt(period.length);
    }
  }
  return guide;
}

function weeklySpending(
  transactions: Transaction[],
  budgets: Budget[],
  weeklyBudgets: BackendBudget[],
  today: string,
) {
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const calendarStart = shiftDays(today, -((weekday + 6) % 7));
  const activeWeekly = weeklyBudgets.flatMap((budget) => {
    if (!budget.isActive || budget.deletedAt !== null || budget.cadence !== "weekly") return [];
    const period = budgetPeriodForDate(budget, today);
    return period ? [{ budget, period }] : [];
  });
  const firstPeriod = activeWeekly[0]?.period;
  // Different start days represent different seven-day windows and cannot share a gauge.
  const sharedWeeklyPeriod =
    firstPeriod &&
    activeWeekly.every(
      ({ period }) =>
        period.startsOn === firstPeriod.startsOn && period.endsOn === firstPeriod.endsOn,
    )
      ? firstPeriod
      : null;
  const startsOn = sharedWeeklyPeriod?.startsOn ?? calendarStart;
  const dates = Array.from({ length: 7 }, (_, index) => shiftDays(startsOn, index));
  const categoryIds = new Set(activeWeekly.map(({ budget }) => budget.categoryId));
  const expenses = transactions.filter(
    (transaction) =>
      transaction.status === "confirmed" &&
      transaction.kind === "expense" &&
      Object.keys(transactionErrors(transaction)).length === 0 &&
      transaction.date !== null &&
      transaction.date >= startsOn &&
      transaction.date <= dates[6] &&
      transaction.date <= today &&
      (!sharedWeeklyPeriod || categoryIds.has(transaction.categoryId ?? "")),
  );
  const days = dates.map((date) => ({
    date,
    spending: expenses
      .filter((transaction) => transaction.date === date)
      .reduce((total, transaction) => total + BigInt(transaction.amount ?? 0), BigInt(0)),
    future: date > today,
    today: date === today,
  }));
  const spending = days.reduce((total, day) => total + day.spending, BigInt(0));
  const limit = sharedWeeklyPeriod
    ? activeWeekly.reduce(
        (total, { budget }) => total + BigInt(budget.limit.amountMinor),
        BigInt(0),
      )
    : monthlyWeekGuide(budgets, dates);
  const basis = sharedWeeklyPeriod ? "weekly-budgets" : limit > BigInt(0) ? "monthly-guide" : null;
  return {
    startsOn,
    endsOn: dates[6],
    days,
    spending,
    count: expenses.length,
    limit,
    basis,
    hasDifferentWeeklyPeriods: activeWeekly.length > 0 && !sharedWeeklyPeriod,
    budgetCount: activeWeekly.length,
    remaining: limit > spending ? limit - spending : BigInt(0),
    over: spending > limit && limit > BigInt(0) ? spending - limit : BigInt(0),
    percent: limit > BigInt(0) ? Number((spending * BigInt(100)) / limit) : null,
    elapsedPercent: Math.round(((daysBetween(startsOn, today) + 1) / 7) * 100),
    maximumDay: days.reduce(
      (largest, day) => (day.spending > largest ? day.spending : largest),
      BigInt(0),
    ),
  };
}

export function overviewModel(
  transactions: Transaction[],
  budgets: Budget[],
  bills: RecurringBill[],
  month: string,
  today = demoToday,
  weeklyBudgets: BackendBudget[] = [],
) {
  const currentMonth = today.slice(0, 7);
  const summary = demoSummary(transactions, month);
  const expenses = summary.confirmed.filter((item) => item.kind === "expense");
  const usage = budgets
    .map((budget) => ({ ...budgetUsage(transactions, budget, month, today), budget }))
    .filter((item) => item.periodStartsOn !== null);
  const budgetTotal = usage.reduce((total, item) => total + item.limit, BigInt(0));
  const budgetUsed = usage.reduce((total, item) => total + item.used, BigInt(0));
  const remaining = usage.reduce(
    (total, item) => total + (item.remaining > BigInt(0) ? item.remaining : BigInt(0)),
    BigInt(0),
  );
  const overBudgets = usage.filter((item) => item.state === "over");
  const attentionBudget = usage
    .filter((item) => item.state !== "on-track")
    .sort((a, b) => severity[b.state] - severity[a.state] || b.percent - a.percent)[0];
  const upcomingBills =
    month === currentMonth
      ? bills
          .filter((bill) => {
            const days = daysBetween(today, bill.nextDue);
            return bill.status === "active" && days >= 0 && days <= 6;
          })
          .sort((a, b) => a.nextDue.localeCompare(b.nextDue))
      : [];

  const currentDay = Number(today.slice(8, 10));
  const elapsedPercent =
    month < currentMonth
      ? 100
      : month === currentMonth
        ? Math.round((currentDay / daysInMonth(month)) * 100)
        : 0;

  const pendingCount = transactions.filter((item) => item.status === "pending").length;
  const calendarBudgetPeriods = budgets.every(
    (budget) => !budget.startsOn || budget.startsOn.endsWith("-01"),
  );
  const dailyGuide = month === currentMonth ? safeToSpendToday(transactions, budgets, today) : null;

  return {
    summary,
    weekly:
      month === currentMonth ? weeklySpending(transactions, budgets, weeklyBudgets, today) : null,
    attention: month === currentMonth ? attentionItems(usage, bills, pendingCount, today) : [],
    facts: monthFacts(transactions, month, today, summary.spending),
    usage,
    elapsedPercent,
    // Safe-to-spend only applies to the month that is still running.
    safeToSpend: dailyGuide?.dailyGuideAvailable ? dailyGuide : null,
    calendarBudgetPeriods,
    savingsRate:
      summary.income > BigInt(0)
        ? Number((summary.difference * BigInt(100)) / summary.income)
        : null,
    comparison: monthComparison(transactions, month, today),
    pendingCount,
    recent: latestConfirmed(transactions, summary.confirmed, month, today),
    expenseCount: expenses.length,
    todaySpending: expenses
      .filter((item) => item.date === today)
      .reduce((total, item) => total + BigInt(item.amount ?? 0), BigInt(0)),
    todayCount: expenses.filter((item) => item.date === today).length,
    isCurrentMonth: month === currentMonth,
    currentDay,
    daysLeft: month === currentMonth ? daysInMonth(month) - currentDay + 1 : 0,
    hasFinancialActivity: summary.confirmed.some(
      (item) => item.kind === "expense" || item.kind === "income",
    ),
    budgetTotal,
    budgetUsed,
    remaining,
    percent: budgetTotal > BigInt(0) ? Number((budgetUsed * BigInt(100)) / budgetTotal) : 0,
    overBudgetCount: overBudgets.length,
    overAmount: overBudgets.reduce((total, item) => total - item.remaining, BigInt(0)),
    attentionBudget,
    nextBill: upcomingBills[0],
    upcomingBillCount: upcomingBills.length,
    emptyTitle: transactions.length === 0 ? "Start tracking" : "No income or expenses this month",
  };
}
