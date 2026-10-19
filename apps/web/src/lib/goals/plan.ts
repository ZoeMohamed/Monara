import type { FinancialGoal } from "@monara/contracts";
import type { Transaction } from "@/data/demo-ledger";

const DAY_MS = 86_400_000;
const dayNumber = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
const divideUp = (amount: bigint, divisor: bigint) =>
  amount === 0n ? 0n : (amount + divisor - 1n) / divisor;

type GoalPlanItem = {
  goal: FinancialGoal;
  progressPercent: number;
  remaining: bigint;
  requiredMonthly: bigint;
  daysLeft: number;
};
export type GoalPlan = {
  active: GoalPlanItem[];
  completed: GoalPlanItem[];
  confirmedMonths: number;
  monthlySurplus: bigint;
  totalRequiredMonthly: bigint;
  state: "no-history" | "on-track" | "tight" | "needs-adjustment" | "complete";
};

/** Deterministic projection only: it never allocates or moves ledger money. */
export function buildGoalPlan(
  goals: readonly FinancialGoal[],
  transactions: readonly Transaction[],
  today: string,
): GoalPlan {
  const todayDay = dayNumber(today);
  const earliest = todayDay - 89;
  let net = 0n;
  let eligible = 0;
  let earliestSeen = todayDay;
  for (const transaction of transactions) {
    if (
      transaction.status !== "confirmed" ||
      transaction.kind === "exclusion" ||
      transaction.amount === null ||
      transaction.date === null
    )
      continue;
    const transactionDay = dayNumber(transaction.date);
    if (!Number.isFinite(transactionDay) || transactionDay < earliest || transactionDay > todayDay)
      continue;
    eligible += 1;
    earliestSeen = Math.min(earliestSeen, transactionDay);
    net += transaction.kind === "income" ? BigInt(transaction.amount) : -BigInt(transaction.amount);
  }
  const coveredDays = eligible === 0 ? 0 : todayDay - earliestSeen + 1;
  const confirmedMonths =
    coveredDays === 0 ? 0 : Math.min(3, Math.max(1, Math.ceil(coveredDays / 30)));
  const monthlySurplus = net > 0n && confirmedMonths > 0 ? net / BigInt(confirmedMonths) : 0n;
  const items = goals
    .filter((goal) => goal.deletedAt === null)
    .map((goal): GoalPlanItem => {
      const target = BigInt(goal.target.amountMinor);
      const saved = BigInt(goal.saved.amountMinor);
      const remaining = target - saved;
      const daysLeft = Math.max(0, dayNumber(goal.targetDate) - todayDay);
      const monthsLeft = BigInt(Math.max(1, Math.ceil(daysLeft / 30.4375)));
      return {
        goal,
        progressPercent: Number((saved * 100n) / target),
        remaining,
        requiredMonthly: divideUp(remaining, monthsLeft),
        daysLeft,
      };
    });
  const active = items.filter((item) => item.goal.status === "active");
  const completed = items.filter((item) => item.goal.status === "completed");
  const totalRequiredMonthly = active.reduce((sum, item) => sum + item.requiredMonthly, 0n);
  const state =
    active.length === 0
      ? "complete"
      : eligible === 0
        ? "no-history"
        : monthlySurplus < totalRequiredMonthly
          ? "needs-adjustment"
          : totalRequiredMonthly * 5n > monthlySurplus * 4n
            ? "tight"
            : "on-track";
  return { active, completed, confirmedMonths, monthlySurplus, totalRequiredMonthly, state };
}
