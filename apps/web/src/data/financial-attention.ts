import { budgetPeriodForDate } from "@monara/contracts";
import {
  type Budget,
  daysBetween,
  formatDay,
  formatRupiah,
  type RecurringBill,
  type Reminder,
  type Transaction,
  transactionErrors,
} from "./demo-ledger.ts";

export type AttentionBudget = {
  id: string;
  name: string;
  category: string;
  categoryId: string | null;
  cadence: "monthly" | "weekly";
  startsOn: string;
  limit: bigint;
  warningPercent: number;
  active: boolean;
};

export type FinancialAttention = {
  id: string;
  kind: "review" | "budget" | "bill";
  title: string;
  message: string;
  action: "review" | "budgets";
  status: "unread" | "read" | "dismissed";
  coveredReminderIds: string[];
};

export function demoAttentionBudgets(budgets: Budget[], today: string): AttentionBudget[] {
  return budgets.map((budget) => ({
    id: budget.id,
    name: budget.category,
    category: budget.category,
    categoryId: budget.categoryId ?? null,
    cadence: budget.cadence,
    startsOn: budget.startsOn ?? `${today.slice(0, 7)}-01`,
    limit: BigInt(budget.limit),
    warningPercent: budget.warningPercent,
    active: true,
  }));
}

export function mergeNotificationRecords(previous: Reminder[], incoming: Reminder[]): Reminder[] {
  const byId = new Map(previous.map((reminder) => [reminder.id, reminder]));
  const rank = { unread: 0, read: 1, dismissed: 2 };
  for (const reminder of incoming) {
    const existing = byId.get(reminder.id);
    if (
      !existing?.backend ||
      !reminder.backend ||
      existing.backend.updatedAt < reminder.backend.updatedAt ||
      (existing.backend.updatedAt === reminder.backend.updatedAt &&
        rank[existing.status ?? "unread"] <= rank[reminder.status ?? "unread"])
    )
      byId.set(reminder.id, reminder);
  }
  return [...byId.values()];
}

function reviewAttention(transactions: Transaction[]): FinancialAttention[] {
  const pending = transactions.filter((transaction) => transaction.status === "pending");
  if (pending.length === 0) return [];
  const gmail = pending.filter(
    (transaction) => transaction.backend?.source === "gmail_email",
  ).length;
  return [
    {
      id: `review:${pending
        .map((transaction) => transaction.id)
        .sort()
        .join(",")}`,
      kind: "review",
      title: `${pending.length} ${pending.length === 1 ? "transaction" : "transactions"} to review`,
      message: `${gmail > 0 ? `${gmail} from Gmail · ` : ""}Not included in totals.`,
      action: "review",
      status: "unread",
      coveredReminderIds: [],
    },
  ];
}

function storedBudgetRecords(
  reminders: Reminder[],
  budgetId: string,
  startsOn: string,
  endsOn: string,
): Reminder[] {
  return reminders.filter((reminder) => {
    if (reminder.kind !== "budget") return false;
    if (reminder.backend?.kind === "budget_threshold") {
      const date = reminder.backend.scheduledFor.slice(0, 10);
      return (
        reminder.backend.budgetId === budgetId &&
        (reminder.backend.dedupeKey?.startsWith(`budget:${budgetId}:${startsOn}:`) ||
          (date >= startsOn && date <= endsOn))
      );
    }
    return (
      reminder.id.startsWith(`budget:${budgetId}:${startsOn}:`) ||
      (startsOn.endsWith("-01") &&
        reminder.id.startsWith(`budget:${budgetId}:${startsOn.slice(0, 7)}:`))
    );
  });
}

function budgetAttention(
  transactions: Transaction[],
  budgets: AttentionBudget[],
  reminders: Reminder[],
  today: string,
): FinancialAttention[] {
  const confirmed = transactions.filter(
    (transaction) =>
      transaction.status === "confirmed" &&
      transaction.kind === "expense" &&
      Object.keys(transactionErrors(transaction)).length === 0,
  );
  return budgets.flatMap((budget): FinancialAttention[] => {
    if (!budget.active || budget.limit <= 0n) return [];
    const period = budgetPeriodForDate(budget, today);
    if (!period) return [];
    const used = confirmed.reduce(
      (sum, transaction) =>
        transaction.date !== null &&
        transaction.date >= period.startsOn &&
        transaction.date <= period.endsOn &&
        (budget.categoryId
          ? transaction.categoryId === budget.categoryId
          : transaction.category === budget.category)
          ? sum + BigInt(transaction.amount ?? 0)
          : sum,
      0n,
    );
    if (used * 100n < budget.limit * BigInt(budget.warningPercent)) return [];
    const over = used > budget.limit;
    const atLimit = used === budget.limit;
    const threshold = used >= budget.limit ? 100 : budget.warningPercent;
    const stored = storedBudgetRecords(reminders, budget.id, period.startsOn, period.endsOn);
    const matchingThreshold = stored.some((reminder) =>
      reminder.backend?.kind === "budget_threshold"
        ? reminder.backend.thresholdPercent === threshold
        : reminder.id.endsWith(`:${threshold}`),
    );
    if (!over && matchingThreshold) return [];
    const remaining = budget.limit - used;
    return [
      {
        id: `budget:${budget.id}:${period.startsOn}:${budget.limit}:${threshold}:${over ? "over" : atLimit ? "at" : "near"}`,
        kind: "budget",
        title: `${budget.name} ${over ? "is over budget" : atLimit ? "is at its limit" : "is near its limit"}`,
        message: `${formatRupiah(used)} of ${formatRupiah(budget.limit)} · ${formatRupiah(remaining < 0n ? -remaining : remaining)} ${over ? "over" : "left"} · Until ${formatDay(period.endsOn)}`,
        action: "budgets",
        status: "unread",
        coveredReminderIds: stored.map((reminder) => reminder.id),
      },
    ];
  });
}

function billAttention(
  bills: RecurringBill[],
  reminders: Reminder[],
  today: string,
): FinancialAttention[] {
  return bills.flatMap((bill): FinancialAttention[] => {
    if (bill.status !== "active") return [];
    const days = daysBetween(today, bill.nextDue);
    if (days > 3) return [];
    const stored = reminders.filter((reminder) => {
      if (reminder.kind !== "bill") return false;
      if (reminder.backend?.kind !== "bill_due")
        return reminder.id.startsWith(`bill:${bill.id}:${bill.nextDue}:`);
      const due = new Date(reminder.backend.scheduledFor);
      due.setUTCDate(due.getUTCDate() + reminder.backend.offsetDays);
      return (
        reminder.backend.recurringBillId === bill.id &&
        due.toISOString().slice(0, 10) === bill.nextDue
      );
    });
    const matchingPhase = stored.some((reminder) =>
      reminder.backend?.kind === "bill_due"
        ? reminder.backend.offsetDays === days &&
          reminder.backend.scheduledFor.slice(0, 10) === today
        : reminder.id.endsWith(`:${days}`),
    );
    if (days >= 0 && matchingPhase) return [];
    const due =
      days < 0
        ? `was due ${formatDay(bill.nextDue)}`
        : days === 0
          ? "is due today"
          : `is due ${formatDay(bill.nextDue)}`;
    return [
      {
        id: `bill:${bill.id}:${bill.nextDue}:${days < 0 ? "overdue" : days === 0 ? "today" : "soon"}`,
        kind: "bill",
        title: `${bill.merchant} ${due}`,
        message: `${formatRupiah(bill.expectedAmount)} · Check the payment in your ledger.`,
        action: "budgets",
        status: "unread",
        coveredReminderIds: stored.map((reminder) => reminder.id),
      },
    ];
  });
}

export function notificationUpdatesCount(
  reminders: Reminder[],
  attention: FinancialAttention[],
  bills: RecurringBill[],
): number {
  const covered = new Set(attention.flatMap((item) => item.coveredReminderIds));
  return (
    mergeNotificationRecords([], reminders).filter(
      (reminder) =>
        !covered.has(reminder.id) && reminder.status !== "read" && reminder.status !== "dismissed",
    ).length +
    attention.filter((item) => item.status === "unread").length +
    bills.filter((bill) => bill.status === "suggested").length
  );
}

export function financialAttention({
  transactions,
  budgets,
  bills,
  reminders,
  today,
  states = {},
}: {
  transactions: Transaction[];
  budgets: AttentionBudget[];
  bills: RecurringBill[];
  reminders: Reminder[];
  today: string;
  states?: Record<string, "read" | "dismissed">;
}): FinancialAttention[] {
  return [
    ...reviewAttention(transactions),
    ...budgetAttention(transactions, budgets, reminders, today),
    ...billAttention(bills, reminders, today),
  ].map((attention) => ({ ...attention, status: states[attention.id] ?? "unread" }));
}
