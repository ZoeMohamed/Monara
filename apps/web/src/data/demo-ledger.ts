// Presentation-only, synthetic session data. Backend contracts and writes belong to Zoe.
type TransactionKind = "expense" | "income" | "transfer";
type ReviewStatus = "pending" | "confirmed" | "rejected";
export type Transaction = {
  id: string;
  merchant: string | null;
  category: string | null;
  amount: number | null;
  currency: "IDR" | null;
  date: string | null;
  time: string | null;
  method: string | null;
  kind: TransactionKind | null;
  emoji: string;
  confidence: number | null;
  status: ReviewStatus;
};

export type TransactionValues = Pick<
  Transaction,
  "merchant" | "category" | "amount" | "currency" | "date" | "time" | "method" | "kind"
>;
export type TransactionErrors = Partial<Record<keyof TransactionValues, string>>;

export const demoToday = "2026-10-11";
export const demoMethods = ["BCA", "GoPay", "Jago", "Mandiri", "Cash"];
export const demoTransferMethods = ["BCA → Jago", "Jago → BCA"];
export const demoCategoryNames = ["Food & Drinks", "Transport", "Shopping", "Digital", "Other"];

export function isCalendarDate(value: string | null): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function transactionErrors(values: TransactionValues): TransactionErrors {
  const errors: TransactionErrors = {};
  if (!values.kind || !["expense", "income", "transfer"].includes(values.kind)) {
    errors.kind = "Choose the transaction type.";
  }
  if (values.amount === null || !Number.isSafeInteger(values.amount) || values.amount <= 0) {
    errors.amount = "Enter a positive whole amount of rupiah within the supported range.";
  }
  if (values.currency !== "IDR") errors.currency = "Choose IDR. Monara supports rupiah only.";
  if (!isCalendarDate(values.date)) errors.date = "Enter a valid transaction date.";
  if (values.kind === "transfer" && !demoTransferMethods.includes(values.method ?? "")) {
    errors.method = "Choose the source and destination Financial Accounts.";
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
        method: "Transfer accounts missing or invalid",
      })[key as "kind" | "amount" | "currency" | "date" | "method"],
  );
  if (!transaction.method && transaction.kind !== "transfer") {
    flags.push("Financial account not assigned");
  }
  if (!transaction.category) flags.push("Category not assigned");
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

export function rejectPendingTransaction(transactions: Transaction[], id: string): Transaction[] {
  return transactions.map((transaction) =>
    transaction.id === id && transaction.status === "pending"
      ? { ...transaction, status: "rejected" }
      : transaction,
  );
}

// A calendar month as "YYYY-MM". The dashboard summarizes one selected month (PRD D-010).
export const demoMonth = demoToday.slice(0, 7);

export function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index - 1 + delta, 1)).toISOString().slice(0, 7);
}

export function formatMonth(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function daysInMonth(month: string): number {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index, 0)).getUTCDate();
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
};

export function budgetUsage(transactions: Transaction[], budget: Budget, month = demoMonth) {
  const used = sumAmounts(
    demoSummary(transactions, month).confirmed.filter(
      (transaction) => transaction.kind === "expense" && transaction.category === budget.category,
    ),
  );
  const limit = BigInt(budget.limit);
  const percent =
    limit > BigInt(0) ? Number((used * BigInt(100)) / limit) : used > BigInt(0) ? 100 : 0;
  const state: "on-track" | "warning" | "over" =
    percent >= 100 ? "over" : percent >= budget.warningPercent ? "warning" : "on-track";
  return { used, limit, remaining: limit - used, percent, state };
}

// PRD F9: remaining budget divided by remaining days, counting today.
// Overall spending includes every confirmed expense, even without a Category budget.
// Clamp only the overall recommendation; overspending still reduces the other budgets' headroom.
export function safeToSpendToday(
  transactions: Transaction[],
  budgets: Budget[],
  today = demoToday,
) {
  const month = today.slice(0, 7);
  const daysLeft = daysInMonth(month) - Number(today.slice(8, 10)) + 1;
  const limit = budgets.reduce((sum, budget) => sum + BigInt(budget.limit), BigInt(0));
  const spending = demoSummary(transactions, month).spending;
  const rawRemaining = limit - spending;
  const remaining = rawRemaining > BigInt(0) ? rawRemaining : BigInt(0);
  const shortfall = rawRemaining < BigInt(0) ? -rawRemaining : BigInt(0);
  const perCategory = budgets.map((budget) => {
    const usage = budgetUsage(transactions, budget, month);
    const available = usage.remaining > BigInt(0) ? usage.remaining : BigInt(0);
    return { budget, ...usage, available, perDay: available / BigInt(daysLeft) };
  });
  return {
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

export type Reminder = { id: string; kind: "budget" | "bill"; message: string };

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
  const periodEnd = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const reminders: Reminder[] = [];
  for (const budget of budgets) {
    const usage = budgetUsage(transactions, budget, month);
    if (usage.state === "on-track") continue;
    const threshold = usage.state === "over" ? 100 : budget.warningPercent;
    const left = usage.remaining > BigInt(0) ? usage.remaining : BigInt(0);
    reminders.push({
      id: `budget:${budget.id}:${month}:${threshold}`,
      kind: "budget",
      message: `Heads up: you have used ${usage.percent}% of your ${budget.category} budget (${formatRupiah(usage.used)} of ${formatRupiah(usage.limit)}). ${formatRupiah(left)} is left until ${formatDay(periodEnd)}.`,
    });
  }
  for (const bill of bills) {
    const offset = daysBetween(today, bill.nextDue);
    if (bill.status !== "active" || !BILL_REMINDER_OFFSETS.includes(offset)) continue;
    reminders.push({
      id: `bill:${bill.id}:${bill.nextDue}:${offset}`,
      kind: "bill",
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
