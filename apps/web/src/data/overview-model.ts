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

export function overviewModel(
  transactions: Transaction[],
  budgets: Budget[],
  bills: RecurringBill[],
  month: string,
  today = demoToday,
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
    hasFinancialActivity: summary.confirmed.length > 0,
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
