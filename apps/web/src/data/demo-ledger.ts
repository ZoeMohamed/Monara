import {
  type Budget as BackendBudget,
  type BudgetUsage as BackendBudgetUsage,
  type Reminder as BackendReminder,
  type Transaction as BackendTransaction,
  budgetPeriodForDate,
} from "@monara/contracts";

// Presentation models support both explicit demo data and validated owned backend records.
type TransactionKind = "expense" | "income" | "exclusion";
type ReviewStatus = "pending" | "confirmed";
export type Transaction = {
  id: string;
  merchant: string | null;
  category: string | null;
  categoryIcon?: string;
  amount: number | null;
  currency: "IDR" | null;
  date: string | null;
  time: string | null;
  method: string | null;
  kind: TransactionKind | null;
  emoji: string;
  confidence: number | null;
  status: ReviewStatus;
  backend?: BackendTransaction;
  categoryId?: string | null;
  financialAccountId?: string | null;
};

export type TransactionValues = Pick<
  Transaction,
  | "merchant"
  | "category"
  | "categoryIcon"
  | "amount"
  | "currency"
  | "date"
  | "time"
  | "method"
  | "kind"
  | "categoryId"
  | "financialAccountId"
>;
export type TransactionErrors = Partial<Record<keyof TransactionValues, string>>;

export const demoToday = "2026-10-11";
export const demoMethods = ["BCA", "GoPay", "Jago", "Mandiri", "Cash"];
export const demoCategoryNames = ["Food & Drinks", "Transport", "Shopping", "Digital", "Other"];

export function isCalendarDate(value: string | null): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function transactionErrors(values: TransactionValues): TransactionErrors {
  const errors: TransactionErrors = {};
  if (!values.kind || !["expense", "income", "exclusion"].includes(values.kind)) {
    errors.kind = "Choose the transaction type.";
  }
  if (
    values.kind !== "exclusion" &&
    (values.amount === null || !Number.isSafeInteger(values.amount) || values.amount <= 0)
  ) {
    errors.amount = "Enter a positive whole amount of rupiah within the supported range.";
  }
  if (values.kind !== "exclusion" && values.currency !== "IDR") {
    errors.currency = "Choose IDR. Monara supports rupiah only.";
  }
  if (values.kind !== "exclusion" && !isCalendarDate(values.date)) {
    errors.date = "Enter a valid transaction date.";
  }
  return errors;
}

export function reviewFlags(transaction: Transaction): string[] {
  const flags = Object.keys(transactionErrors(transaction)).map(
    (key) =>
      ({
        kind: "Type missing",
        amount: "Amount missing or invalid",
        currency: "Currency missing",
        date: "Date missing or invalid",
        method: "Financial account missing",
      })[key as "kind" | "amount" | "currency" | "date" | "method"],
  );
  if (transaction.kind !== "exclusion" && !transaction.method) {
    flags.push("Financial account not assigned");
  }
  if (transaction.confidence === null) flags.push("Confidence unavailable");
  else if (transaction.confidence < 95) flags.push("Low confidence");
  return flags;
}

export function updatePendingTransaction(
  transactions: Transaction[],
  id: string,
  values: TransactionValues,
  action: "edit" | "confirm",
): Transaction[] {
  if (action === "confirm" && Object.keys(transactionErrors(values)).length > 0)
    return transactions;
  return transactions.map((transaction) =>
    transaction.id === id && transaction.status === "pending"
      ? { ...transaction, ...values, status: action === "confirm" ? "confirmed" : "pending" }
      : transaction,
  );
}

export function updateConfirmedTransaction(
  transactions: Transaction[],
  id: string,
  values: TransactionValues,
): Transaction[] {
  const existing = transactions.find((transaction) => transaction.id === id);
  if (
    existing?.status !== "confirmed" ||
    Object.keys(transactionErrors(existing)).length > 0 ||
    Object.keys(transactionErrors(values)).length > 0
  ) {
    return transactions;
  }
  const { merchant, category, amount, currency, date, time, method, kind } = values;
  const corrected: Transaction = {
    ...existing,
    merchant,
    category,
    amount,
    currency,
    date,
    time,
    method,
    kind,
    ...(values.categoryIcon === undefined ? {} : { categoryIcon: values.categoryIcon }),
    ...(values.financialAccountId === undefined
      ? {}
      : { financialAccountId: values.financialAccountId }),
  };
  return transactions.map((transaction) => (transaction === existing ? corrected : transaction));
}

// An undo must never overwrite a newer edit or restore the whole ledger snapshot.
export function undoTransactionUpdate(
  transactions: Transaction[],
  before: Transaction,
  expected: Transaction,
): Transaction[] {
  if (before.id !== expected.id || !transactions.some((transaction) => transaction === expected)) {
    return transactions;
  }
  return transactions.map((transaction) => (transaction === expected ? before : transaction));
}

// Session-only deletion requires the exact reviewed record, so stale views cannot remove a newer edit.
export function deleteConfirmedTransaction(
  transactions: Transaction[],
  expected: Transaction,
): Transaction[] {
  const matches = transactions.filter((transaction) => transaction.id === expected.id);
  if (
    matches.length !== 1 ||
    matches[0] !== expected ||
    expected.status !== "confirmed" ||
    Object.keys(transactionErrors(expected)).length > 0
  ) {
    return transactions;
  }
  return transactions.filter((transaction) => transaction !== expected);
}

// Restore only the deleted record; never replace newer records or a whole ledger snapshot.
export function undoTransactionDeletion(
  transactions: Transaction[],
  deleted: Transaction,
  index: number,
): Transaction[] {
  if (
    deleted.status !== "confirmed" ||
    Object.keys(transactionErrors(deleted)).length > 0 ||
    !Number.isSafeInteger(index) ||
    index < 0 ||
    transactions.some((transaction) => transaction.id === deleted.id)
  ) {
    return transactions;
  }
  const insertionIndex = Math.min(index, transactions.length);
  return [...transactions.slice(0, insertionIndex), deleted, ...transactions.slice(insertionIndex)];
}

export function excludePendingTransaction(transactions: Transaction[], id: string): Transaction[] {
  return transactions.map((transaction) =>
    transaction.id === id && transaction.status === "pending"
      ? { ...transaction, kind: "exclusion", status: "confirmed" }
      : transaction,
  );
}

// A calendar month as "YYYY-MM". The dashboard summarizes one selected month (PRD D-010).
export const demoMonth = demoToday.slice(0, 7);

// Reports include five previous months, all within the four-digit calendar-year range.
export const earliestReportMonth = "0000-06";

export function shiftMonth(month: string, delta: number): string {
  if (!/^\d{4}-\d{2}$/.test(month) || !isCalendarDate(`${month}-01`)) {
    throw new Error("Choose a valid calendar month.");
  }
  if (!Number.isSafeInteger(delta)) throw new Error("Choose a whole number of months.");
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + delta;
  if (index < 0 || index > 9999 * 12 + 11) {
    throw new Error("Month shift leaves the supported calendar range, 0000–9999.");
  }
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function formatMonth(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function daysInMonth(month: string): number {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return date.getUTCDate();
}

export function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function sumAmounts(transactions: Transaction[]): bigint {
  return transactions.reduce((sum, item) => sum + BigInt(item.amount ?? 0), BigInt(0));
}

// Newest first by date, then time; records without a date sort last.
export function newestFirst(a: Transaction, b: Transaction): number {
  return `${b.date ?? ""}${b.time ?? ""}`.localeCompare(`${a.date ?? ""}${a.time ?? ""}`);
}

export function demoSummary(transactions: Transaction[], month = demoMonth) {
  const confirmed = transactions.filter(
    (transaction) =>
      transaction.status === "confirmed" &&
      (transaction.kind === "expense" || transaction.kind === "income") &&
      Object.keys(transactionErrors(transaction)).length === 0 &&
      transaction.date?.startsWith(`${month}-`),
  );
  const spending = sumAmounts(confirmed.filter((transaction) => transaction.kind === "expense"));
  const income = sumAmounts(confirmed.filter((transaction) => transaction.kind === "income"));
  return { spending, income, difference: income - spending, confirmed };
}

// Field names follow the ERD tab (budgets.cadence, limit_amount, warning_percent).
export type Budget = {
  id: string;
  category: string;
  emoji: string;
  cadence: "monthly";
  limit: number;
  warningPercent: number;
  icon?: string;
  categoryId?: string;
  startsOn?: string;
  usage?: BackendBudgetUsage;
  usageMonth?: string;
  backend?: BackendBudget;
};

export function budgetUsage(
  transactions: Transaction[],
  budget: Budget,
  month = demoMonth,
  today = demoToday,
) {
  const date =
    month === today.slice(0, 7) ? today : `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const period = budgetPeriodForDate(
    { cadence: budget.cadence, startsOn: budget.startsOn ?? `${month}-01` },
    date,
  );
  const used = sumAmounts(
    transactions.filter(
      (transaction) =>
        period !== null &&
        transaction.status === "confirmed" &&
        Object.keys(transactionErrors(transaction)).length === 0 &&
        transaction.date !== null &&
        transaction.date >= period.startsOn &&
        transaction.date <= period.endsOn &&
        transaction.kind === "expense" &&
        (budget.categoryId
          ? transaction.categoryId === budget.categoryId
          : transaction.category === budget.category),
    ),
  );
  const actualUsed =
    budget.usage && budget.usageMonth === month ? BigInt(budget.usage.used.amountMinor) : used;
  const limit = BigInt(budget.limit);
  const percent =
    limit > BigInt(0)
      ? Number((actualUsed * BigInt(100)) / limit)
      : actualUsed > BigInt(0)
        ? 100
        : 0;
  const state: "on-track" | "warning" | "at-limit" | "over" =
    actualUsed > limit
      ? "over"
      : limit > BigInt(0) && actualUsed === limit
        ? "at-limit"
        : percent >= budget.warningPercent
          ? "warning"
          : "on-track";
  return {
    used: actualUsed,
    limit,
    remaining: limit - actualUsed,
    percent,
    state,
    periodStartsOn:
      (budget.usageMonth === month ? budget.usage?.periodStartsOn : undefined) ??
      period?.startsOn ??
      null,
    periodEndsOn:
      (budget.usageMonth === month ? budget.usage?.periodEndsOn : undefined) ??
      period?.endsOn ??
      null,
  };
}

// PRD F9: remaining budget divided by remaining days, counting today.
// Overall spending includes every confirmed expense, even without a Category budget.
// Clamp only the overall recommendation; overspending reduces the other budgets' headroom.
export function safeToSpendToday(
  transactions: Transaction[],
  budgets: Budget[],
  today = demoToday,
) {
  const month = today.slice(0, 7);
  const daysLeft = daysInMonth(month) - Number(today.slice(8, 10)) + 1;
  const activeBudgets = budgets.filter((budget) => !budget.startsOn || budget.startsOn <= today);
  const limit = activeBudgets.reduce((sum, budget) => sum + BigInt(budget.limit), BigInt(0));
  const spending = demoSummary(transactions, month).spending;
  const rawRemaining = limit - spending;
  const remaining = rawRemaining > BigInt(0) ? rawRemaining : BigInt(0);
  const shortfall = rawRemaining < BigInt(0) ? -rawRemaining : BigInt(0);
  const perCategory = activeBudgets.map((budget) => {
    const usage = budgetUsage(transactions, budget, month, today);
    const available = usage.remaining > BigInt(0) ? usage.remaining : BigInt(0);
    return { budget, ...usage, available, perDay: available / BigInt(daysLeft) };
  });
  return {
    dailyGuideAvailable:
      budgets.length > 0 &&
      budgets.every(
        (budget) =>
          !budget.startsOn || (budget.startsOn.endsWith("-01") && budget.startsOn <= today),
      ),
    limit,
    spending,
    rawRemaining,
    shortfall,
    remaining,
    daysLeft,
    perDay: remaining / BigInt(daysLeft),
    perCategory,
  };
}

// Field names follow the ERD tab (recurring_bills.expected_amount, next_due_on, cancellation_url).
export type RecurringBill = {
  id: string;
  merchant: string;
  emoji: string;
  expectedAmount: number;
  cadence: "monthly";
  nextDue: string;
  cancellationUrl: string | null;
  // Detected bills stay suggestions until the User confirms them (PRD F8).
  status: "active" | "suggested";
};

export type Reminder = {
  id: string;
  kind: "budget" | "bill";
  message: string;
  title?: string;
  status?: "unread" | "read" | "dismissed";
  scheduledFor?: string;
  backend?: BackendReminder;
};

// PRD F13: bill reminders fire 3 days before and on the due date.
const BILL_REMINDER_OFFSETS = [3, 0];

// Current eligible Reminder previews use PRD F13 template wording and dedupe-shaped IDs.
// Threshold crossing history, delivery, dedupe and quiet-hour scheduling belong to AB4.
export function demoReminders(
  transactions: Transaction[],
  budgets: Budget[],
  bills: RecurringBill[],
  today = demoToday,
): Reminder[] {
  const month = today.slice(0, 7);
  const reminders: Reminder[] = [];
  for (const budget of budgets) {
    const usage = budgetUsage(transactions, budget, month, today);
    if (usage.state === "on-track") continue;
    const threshold =
      usage.state === "over" || usage.state === "at-limit" ? 100 : budget.warningPercent;
    const left = usage.remaining > BigInt(0) ? usage.remaining : BigInt(0);
    reminders.push({
      id: `budget:${budget.id}:${budget.startsOn ? usage.periodStartsOn : month}:${threshold}`,
      kind: "budget",
      title: `${budget.category} budget`,
      status: "unread",
      scheduledFor: today,
      message: `Heads up: you have used ${usage.percent}% of your ${budget.category} budget (${formatRupiah(usage.used)} of ${formatRupiah(usage.limit)}). ${formatRupiah(left)} is left until ${formatDay(usage.periodEndsOn ?? `${month}-${daysInMonth(month)}`)}.`,
    });
  }
  for (const bill of bills) {
    const offset = daysBetween(today, bill.nextDue);
    if (bill.status !== "active" || !BILL_REMINDER_OFFSETS.includes(offset)) continue;
    reminders.push({
      id: `bill:${bill.id}:${bill.nextDue}:${offset}`,
      kind: "bill",
      title: `${bill.merchant} due`,
      status: "unread",
      scheduledFor: today,
      message: `Reminder: ${formatRupiah(bill.expectedAmount)} of ${bill.merchant} is due on ${formatDay(bill.nextDue)}.`,
    });
  }
  return reminders;
}

const rupiahFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "IDR",
  currencyDisplay: "narrowSymbol",
  maximumFractionDigits: 0,
});

export function formatRupiah(value: number | bigint) {
  return rupiahFormatter.format(value);
}
