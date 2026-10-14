import {
  type Budget,
  budgetPageSchema,
  type Category,
  calendarDateSchema,
  calendarMonthSchema,
  categoryPageSchema,
  type DashboardSummary,
  dashboardSummarySchema,
  type FinancialAccount,
  financialAccountPageSchema,
  type Transaction,
  transactionPageSchema,
} from "@monara/contracts";

import type {
  Budget as PresentationBudget,
  Transaction as PresentationTransaction,
  Reminder,
} from "../../data/demo-ledger.ts";

export type OwnedTransaction = PresentationTransaction & { backend: Transaction };
type OwnedBudget = PresentationBudget & { backend: Budget };

export type FinanceSnapshot = {
  transactions: OwnedTransaction[];
  budgets: OwnedBudget[];
  financialAccounts: FinancialAccount[];
  categories: Category[];
  allBudgets: Budget[];
  dashboard: DashboardSummary;
  reminders: Reminder[];
  month: string;
  today: string;
};

export class FinancePresentationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinancePresentationError";
  }
}

/** The current editor supports safe whole numbers; reject wider values instead of rounding. */
export function safePresentationAmount(value: string): number {
  const exact = BigInt(value);
  if (exact < 0n || exact > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new FinancePresentationError(
      "This ledger includes an amount above the range supported by this view. Your stored records have not changed.",
    );
  }
  return Number(exact);
}

/** Parse editor text before converting to a number, so fractions cannot round into valid money. */
export function parseDraftAmount(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) {
    throw new FinancePresentationError("Enter a positive whole amount of rupiah.");
  }
  if (BigInt(trimmed) > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new FinancePresentationError("This amount is above the range supported by this view.");
  }
  return safePresentationAmount(trimmed);
}

export function mapOwnedTransaction(
  transaction: Transaction,
  financialAccounts: FinancialAccount[],
  categories: Category[],
): OwnedTransaction {
  const category = categories.find((item) => item.id === transaction.categoryId);
  const account = financialAccounts.find((item) => item.id === transaction.financialAccountId);
  const from = financialAccounts.find((item) => item.id === transaction.fromFinancialAccountId);
  const to = financialAccounts.find((item) => item.id === transaction.toFinancialAccountId);
  const referenceIds = [
    transaction.financialAccountId,
    transaction.fromFinancialAccountId,
    transaction.toFinancialAccountId,
  ].filter((id) => id !== null);
  if (
    referenceIds.some((id) => !financialAccounts.some((item) => item.id === id)) ||
    (transaction.categoryId !== null && !category)
  ) {
    throw new FinancePresentationError(
      "A linked account or category could not be loaded. Refresh your records and try again.",
    );
  }
  return {
    id: transaction.id,
    merchant: transaction.merchantName ?? transaction.description,
    category: category?.name ?? null,
    amount:
      transaction.money === null ? null : safePresentationAmount(transaction.money.amountMinor),
    currency: transaction.money?.currency ?? null,
    date: transaction.occurredOn,
    time: transaction.occurredTime,
    method:
      transaction.kind === "transfer"
        ? from && to
          ? `${from.name} → ${to.name}`
          : null
        : (account?.name ?? null),
    kind: transaction.kind,
    emoji: transaction.kind === "income" ? "↗" : transaction.kind === "transfer" ? "↔" : "•",
    confidence: transaction.confidence === null ? null : transaction.confidence * 100,
    status: transaction.reviewStatus,
    categoryId: transaction.categoryId,
    financialAccountId: transaction.financialAccountId,
    fromFinancialAccountId: transaction.fromFinancialAccountId,
    toFinancialAccountId: transaction.toFinancialAccountId,
    backend: transaction,
  };
}

function mapOwnedBudget(budget: Budget, categories: Category[]): OwnedBudget {
  const category = categories.find((item) => item.id === budget.categoryId);
  if (!category) {
    throw new FinancePresentationError(
      "A budget category could not be loaded. Refresh your records and try again.",
    );
  }
  if (budget.cadence !== "monthly") {
    throw new FinancePresentationError("This view supports monthly budgets only.");
  }
  return {
    id: budget.id,
    category: category.name,
    emoji: "•",
    cadence: "monthly",
    limit: safePresentationAmount(budget.limit.amountMinor),
    warningPercent: budget.warningPercent,
    categoryId: budget.categoryId,
    backend: budget,
  };
}

type ListOperation =
  | "list_transactions"
  | "list_financial_accounts"
  | "list_categories"
  | "list_budgets";
export type FinanceReader = (
  operation: ListOperation | "get_dashboard",
  input: unknown,
) => Promise<unknown>;

const pageSchemas = {
  list_transactions: transactionPageSchema,
  list_financial_accounts: financialAccountPageSchema,
  list_categories: categoryPageSchema,
  list_budgets: budgetPageSchema,
} as const;

async function loadAllPages<Operation extends ListOperation>(
  operation: Operation,
  read: FinanceReader,
): Promise<ReturnType<(typeof pageSchemas)[Operation]["parse"]>["items"]> {
  const items: (Transaction | FinancialAccount | Category | Budget)[] = [];
  const cursors = new Set<string>();
  const ids = new Set<string>();
  let cursor: string | null = null;
  for (let pageIndex = 0; pageIndex < 1_000; pageIndex += 1) {
    const page: {
      items: (Transaction | FinancialAccount | Category | Budget)[];
      nextCursor: string | null;
    } = pageSchemas[operation].parse(await read(operation, { limit: 100, cursor }));
    for (const item of page.items) {
      if (ids.has(item.id)) {
        throw new FinancePresentationError(
          "Your records changed while loading. Refresh and try again.",
        );
      }
      ids.add(item.id);
      items.push(item);
    }
    if (page.nextCursor === null) {
      return items as ReturnType<(typeof pageSchemas)[Operation]["parse"]>["items"];
    }
    if (cursors.has(page.nextCursor)) {
      throw new FinancePresentationError("Your records could not be loaded completely. Try again.");
    }
    cursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  throw new FinancePresentationError("Your records could not be loaded completely. Try again.");
}

/** Loads a complete owned ledger; failures never substitute sample records or partial totals. */
export async function loadFinanceSnapshot(
  read: FinanceReader,
  month: string,
  today = new Date().toISOString().slice(0, 10),
): Promise<FinanceSnapshot> {
  calendarMonthSchema.parse(month);
  calendarDateSchema.parse(today);
  const [records, financialAccounts, categories, allBudgets, dashboardResult] = await Promise.all([
    loadAllPages("list_transactions", read),
    loadAllPages("list_financial_accounts", read),
    loadAllPages("list_categories", read),
    loadAllPages("list_budgets", read),
    read("get_dashboard", { month }),
  ]);
  const dashboard = dashboardSummarySchema.parse(dashboardResult);
  if (dashboard.month !== month) {
    throw new FinancePresentationError("The requested month could not be loaded. Try again.");
  }
  return {
    transactions: records
      .filter((record) => record.deletedAt === null && record.reviewStatus !== "rejected")
      .map((record) => mapOwnedTransaction(record, financialAccounts, categories)),
    budgets: dashboard.budgetUsage
      .filter((usage) => usage.budget.cadence === "monthly")
      .map((usage) => mapOwnedBudget(usage.budget, categories)),
    financialAccounts,
    categories,
    allBudgets,
    dashboard,
    reminders: dashboard.activeReminders.map((reminder) => ({
      id: reminder.id,
      kind: reminder.kind === "budget_threshold" ? "budget" : "bill",
      message: reminder.message,
    })),
    month,
    today,
  };
}
