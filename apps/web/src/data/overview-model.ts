import {
  type Budget,
  budgetUsage,
  daysBetween,
  daysInMonth,
  demoMonth,
  demoSummary,
  demoToday,
  type RecurringBill,
  safeToSpendToday,
  type Transaction,
} from "./demo-ledger";
import { monthComparison } from "./finance-analytics";

export type SceneTime = "morning" | "afternoon" | "evening" | "night";

// The device clock changes the greeting only, never the sample financial period.
export function sceneTime(hour: number): SceneTime {
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 20) return "evening";
  return "night";
}

const severity = { "on-track": 0, warning: 1, "at-limit": 2, over: 3 } as const;

export function overviewModel(
  transactions: Transaction[],
  budgets: Budget[],
  bills: RecurringBill[],
  month: string,
) {
  const summary = demoSummary(transactions, month);
  const expenses = summary.confirmed.filter((item) => item.kind === "expense");
  const usage = budgets.map((budget) => ({ ...budgetUsage(transactions, budget, month), budget }));
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
    month === demoMonth
      ? bills
          .filter((bill) => {
            const days = daysBetween(demoToday, bill.nextDue);
            return bill.status === "active" && days >= 0 && days <= 6;
          })
          .sort((a, b) => a.nextDue.localeCompare(b.nextDue))
      : [];

  const currentDay = Number(demoToday.slice(8, 10));
  const elapsedPercent =
    month < demoMonth
      ? 100
      : month === demoMonth
        ? Math.round((currentDay / daysInMonth(month)) * 100)
        : 0;

  return {
    summary,
    usage,
    elapsedPercent,
    // Safe-to-spend only applies to the month that is still running.
    safeToSpend: month === demoMonth ? safeToSpendToday(transactions, budgets) : null,
    savingsRate:
      summary.income > BigInt(0)
        ? Number((summary.difference * BigInt(100)) / summary.income)
        : null,
    comparison: monthComparison(transactions, month),
    pendingCount: transactions.filter((item) => item.status === "pending").length,
    recent: [...summary.confirmed]
      .sort((a, b) => `${b.date} ${b.time ?? ""}`.localeCompare(`${a.date} ${a.time ?? ""}`))
      .slice(0, 5),
    expenseCount: expenses.length,
    todaySpending: expenses
      .filter((item) => item.date === demoToday)
      .reduce((total, item) => total + BigInt(item.amount ?? 0), BigInt(0)),
    todayCount: expenses.filter((item) => item.date === demoToday).length,
    hasFinancialActivity: summary.confirmed.some((item) => item.kind !== "transfer"),
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
