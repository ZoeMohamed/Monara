import {
  type Budget,
  type BudgetPage,
  type BudgetSuggestion,
  type BudgetUsage,
  budgetMutationResultSchema,
  budgetPeriodForDate,
  budgetSchema,
  budgetSuggestionInputSchema,
  budgetSuggestionSchema,
  budgetUsageSchema,
  type Category,
  type CategoryPage,
  type CreateBudgetInput,
  type CreateCategoryInput,
  type CreateFinancialAccountInput,
  type CreateTransactionInput,
  categoryMutationResultSchema,
  confirmDestructiveActionInputSchema,
  confirmedTransactionValuesSchema,
  confirmTransactionInputSchema,
  createBudgetInputSchema,
  createCategoryInputSchema,
  createCategoryResultSchema,
  createFinancialAccountInputSchema,
  createTransactionInputSchema,
  type DashboardSummary,
  type DeleteBudgetInput,
  type DeleteTransactionInput,
  type DestructiveActionConfirmation,
  type DismissReminderInput,
  dashboardSummarySchema,
  deleteBudgetInputSchema,
  deleteTransactionInputSchema,
  destructiveActionConfirmationSchema,
  dismissReminderInputSchema,
  type FinancialAccount,
  type FinancialAccountPage,
  type FinancialInsights,
  financialAccountMutationResultSchema,
  financialInsightsSchema,
  type GetDashboardInput,
  getDashboardInputSchema,
  type ListBudgetsInput,
  type ListCategoriesInput,
  type ListFinancialAccountsInput,
  type ListRemindersInput,
  type ListTransactionsInput,
  listBudgetsInputSchema,
  listCategoriesInputSchema,
  listFinancialAccountsInputSchema,
  listRemindersInputSchema,
  listTransactionsInputSchema,
  type MarkReminderReadInput,
  type Money,
  markReminderReadInputSchema,
  type OperationErrorCode,
  type Reminder,
  type ReversibleActionReceipt,
  rejectTransactionInputSchema,
  requestDestructiveActionInputSchema,
  type SignedMoney,
  type Transaction,
  type TransactionMutationResult,
  type TransactionPage,
  type TransactionSource,
  type TransactionValues,
  transactionMutationResultSchema,
  transactionValuesSchema,
  type UpdateBudgetInput,
  type UpdateCategoryInput,
  type UpdateFinancialAccountInput,
  type UpdatePendingTransactionInput,
  type UpdateTransactionInput,
  undoActionInputSchema,
  updateBudgetInputSchema,
  updateCategoryInputSchema,
  updateFinancialAccountInputSchema,
  updatePendingTransactionInputSchema,
  updateTransactionInputSchema,
  userIdSchema,
} from "@monara/contracts";

export class FinanceOperationError extends Error {
  readonly code: OperationErrorCode;

  constructor(code: OperationErrorCode, message: string) {
    super(message);
    this.name = "FinanceOperationError";
    this.code = code;
  }
}

export type FinanceChannel = "web" | "whatsapp";

export interface FinanceCaller {
  userId: string;
  channel: FinanceChannel;
  directSource?: "manual_form" | "in_app_chat" | "whatsapp_text";
}

export interface ActionState {
  operation: string;
  [key: string]: boolean | null | number | string | TransactionValues | ActionState;
}

export type DestructiveConfirmationState =
  | { operation: "delete_transaction"; input: DeleteTransactionInput }
  | { operation: "delete_budget"; input: DeleteBudgetInput };

export interface StoredDestructiveConfirmation {
  state: unknown;
  expiresAt: string;
  consumedAt: string | null;
}

export interface StoredUndoAction {
  state: unknown;
  resourceType: string;
  resourceId: string;
  expiresAt: string;
  consumedAt: string | null;
}

export interface FinanceRepository {
  listTransactions(userId: string, input: ListTransactionsInput): Promise<TransactionPage>;
  listTransactionsForMonth(userId: string, month: string): Promise<Transaction[]>;
  listTransactionsForDateRange(
    userId: string,
    startsOn: string,
    endsOn: string,
  ): Promise<Transaction[]>;
  findTransaction(userId: string, transactionId: string): Promise<Transaction | null>;
  createTransaction(input: {
    userId: string;
    source: TransactionSource;
    values: CreateTransactionInput;
  }): Promise<Transaction>;
  replaceTransaction(input: {
    userId: string;
    transactionId: string;
    expectedUpdatedAt: string;
    values: TransactionValues;
    reviewStatus: Transaction["reviewStatus"];
  }): Promise<Transaction>;
  softDeleteTransaction(input: {
    userId: string;
    transactionId: string;
    expectedUpdatedAt: string;
    deletedAt: string;
  }): Promise<Transaction>;

  listFinancialAccounts(
    userId: string,
    input: ListFinancialAccountsInput,
  ): Promise<FinancialAccountPage>;
  createFinancialAccount(
    userId: string,
    input: CreateFinancialAccountInput,
  ): Promise<FinancialAccount>;
  updateFinancialAccount(
    userId: string,
    input: UpdateFinancialAccountInput,
  ): Promise<FinancialAccount>;

  listCategories(userId: string, input: ListCategoriesInput): Promise<CategoryPage>;
  listAllCategories(userId: string): Promise<Category[]>;
  createCategory(userId: string, input: CreateCategoryInput): Promise<Category>;
  updateCategory(userId: string, input: UpdateCategoryInput): Promise<Category>;

  listBudgets(userId: string, input: ListBudgetsInput): Promise<BudgetPage>;
  listAllBudgets(userId: string): Promise<Budget[]>;
  findBudget(userId: string, budgetId: string): Promise<Budget | null>;
  createBudget(userId: string, input: CreateBudgetInput): Promise<Budget>;
  updateBudget(userId: string, input: UpdateBudgetInput): Promise<Budget>;
  softDeleteBudget(input: {
    userId: string;
    budgetId: string;
    expectedUpdatedAt: string;
    deletedAt: string;
  }): Promise<Budget>;

  listUnreadReminders(userId: string, limit: number): Promise<DashboardSummary["activeReminders"]>;
  listReminders(
    userId: string,
    input: ListRemindersInput,
  ): Promise<{ items: Reminder[]; nextCursor: string | null }>;
  findReminder(userId: string, reminderId: string): Promise<Reminder | null>;
  updateReminder(input: {
    userId: string;
    reminderId: string;
    expectedStatus: Reminder["status"];
    status: Reminder["status"];
    readAt: string | null;
  }): Promise<Reminder>;
  createBudgetThresholdReminder(input: {
    userId: string;
    budget: Budget;
    periodStartsOn: string;
    thresholdPercent: number;
    usage: Money;
    scheduledFor: string;
    dedupeKey: string;
  }): Promise<void>;

  recordUndoAction(input: {
    userId: string;
    channel: FinanceChannel;
    toolName: string;
    resourceType: ReversibleActionReceipt["resourceType"];
    resourceId: string;
    changedAt: string;
    undoExpiresAt: string;
    state: ActionState;
  }): Promise<ReversibleActionReceipt>;
  createDestructiveConfirmation(input: {
    userId: string;
    channel: FinanceChannel;
    action: DestructiveConfirmationState["operation"];
    resourceType: "transaction" | "budget";
    resourceId: string;
    requestFingerprint: string;
    createdAt: string;
    expiresAt: string;
    state: DestructiveConfirmationState;
  }): Promise<string>;
  findDestructiveConfirmation(
    userId: string,
    confirmationId: string,
  ): Promise<StoredDestructiveConfirmation | null>;
  consumeDestructiveConfirmation(input: {
    userId: string;
    confirmationId: string;
    consumedAt: string;
  }): Promise<boolean>;
  findUndoAction(userId: string, actionId: string): Promise<StoredUndoAction | null>;
  /** Marks the receipt used. False when it was already used or has expired. */
  consumeUndoAction(input: {
    userId: string;
    actionId: string;
    consumedAt: string;
  }): Promise<boolean>;
}

const idr = (amount: bigint): Money => ({ amountMinor: amount.toString(), currency: "IDR" });
const signedIdr = (amount: bigint): SignedMoney => ({
  amountMinor: amount.toString(),
  currency: "IDR",
});

const amountOf = (money: Money | null): bigint => BigInt(money?.amountMinor ?? "0");

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function lastDayOfMonth(month: string): string {
  const date = parseDate(`${month}-01`);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return formatDate(date);
}

function shiftMonth(month: string, offset: number): string {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, monthIndex + offset, 1);
  const shiftedYear = date.getUTCFullYear();
  if (shiftedYear < 0 || shiftedYear > 9999) {
    throw new RangeError("Month extends beyond supported calendar dates.");
  }
  return `${shiftedYear.toString().padStart(4, "0")}-${(date.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}`;
}

function previousThreeMonthRange(month: string): { startsOn: string; endsOn: string } | null {
  try {
    return {
      startsOn: `${shiftMonth(month, -3)}-01`,
      endsOn: lastDayOfMonth(shiftMonth(month, -1)),
    };
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

function inclusiveDays(startsOn: string, endsOn: string): number {
  return Math.round((parseDate(endsOn).getTime() - parseDate(startsOn).getTime()) / 86_400_000) + 1;
}

function roundedRatio(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

export { budgetPeriodForDate };

/** Read complete active cycles while keeping calendar-month aggregates separate. */
function budgetReadRange(budgets: Budget[], month: string, asOf: string) {
  let startsOn = `${month}-01`;
  let endsOn = lastDayOfMonth(month);
  for (const budget of budgets) {
    if (!budget.isActive || budget.deletedAt) continue;
    const period = budgetPeriodForDate(budget, asOf);
    if (!period) continue;
    if (period.startsOn < startsOn) startsOn = period.startsOn;
    if (period.endsOn > endsOn) endsOn = period.endsOn;
  }
  return { startsOn, endsOn };
}

export function calculateBudgetUsage(
  budget: Budget,
  period: { startsOn: string; endsOn: string },
  transactions: Transaction[],
): BudgetUsage {
  const used = transactions.reduce((sum, transaction) => {
    if (
      transaction.deletedAt ||
      transaction.reviewStatus !== "confirmed" ||
      transaction.kind !== "expense" ||
      transaction.categoryId !== budget.categoryId ||
      !transaction.occurredOn ||
      transaction.occurredOn < period.startsOn ||
      transaction.occurredOn > period.endsOn
    ) {
      return sum;
    }
    return sum + amountOf(transaction.money);
  }, 0n);
  const limit = amountOf(budget.limit);
  const remaining = limit - used;
  const usagePercent = Number((used * 10_000n) / limit) / 100;
  const state =
    used >= limit
      ? "over"
      : used * 100n >= limit * BigInt(budget.warningPercent)
        ? "warning"
        : "on_track";

  return budgetUsageSchema.parse({
    budget,
    periodStartsOn: period.startsOn,
    periodEndsOn: period.endsOn,
    used: idr(used),
    remaining: signedIdr(remaining),
    usagePercent,
    state,
  });
}

export function calculateFinancialInsights(input: {
  month: string;
  asOf: string;
  income: bigint;
  spending: bigint;
  transactions: Transaction[];
  historyTransactions: Transaction[];
  budgetUsage: BudgetUsage[];
  categories: Category[];
}): FinancialInsights {
  const categoryNames = new Map(input.categories.map((category) => [category.id, category.name]));
  const monthStart = `${input.month}-01`;
  const monthEnd = lastDayOfMonth(input.month);
  const difference = input.income - input.spending;
  const splitRemaining = (limit: bigint, spending: bigint) => {
    const raw = limit - spending;
    return {
      remaining: raw > 0n ? raw : 0n,
      shortfall: raw < 0n ? -raw : 0n,
    };
  };

  const byCategory = input.budgetUsage.map((usage) => {
    const limit = amountOf(usage.budget.limit);
    const spending = amountOf(usage.used);
    const { remaining, shortfall } = splitRemaining(limit, spending);
    const remainingDays = inclusiveDays(input.asOf, usage.periodEndsOn);
    return {
      budgetId: usage.budget.id,
      categoryId: usage.budget.categoryId,
      categoryName: categoryNames.get(usage.budget.categoryId) ?? usage.budget.name,
      periodStartsOn: usage.periodStartsOn,
      periodEndsOn: usage.periodEndsOn,
      limit: idr(limit),
      spending: idr(spending),
      remaining: idr(remaining),
      shortfall: idr(shortfall),
      remainingDays,
      dailyAmount: idr(remaining / BigInt(remainingDays)),
    };
  });

  const calendarUsage = input.budgetUsage.filter(
    (usage) => usage.periodStartsOn === monthStart && usage.periodEndsOn === monthEnd,
  );
  const overallLimit = calendarUsage.reduce((sum, usage) => sum + amountOf(usage.budget.limit), 0n);
  const overallRemaining = splitRemaining(overallLimit, input.spending);
  const overallDays = inclusiveDays(input.asOf, monthEnd);
  const overall =
    calendarUsage.length === 0
      ? null
      : {
          limit: idr(overallLimit),
          spending: idr(input.spending),
          remaining: idr(overallRemaining.remaining),
          shortfall: idr(overallRemaining.shortfall),
          remainingDays: overallDays,
          dailyAmount: idr(overallRemaining.remaining / BigInt(overallDays)),
        };

  const overspendForecasts = input.budgetUsage
    .map((usage) => {
      const elapsedDays = inclusiveDays(usage.periodStartsOn, input.asOf);
      const periodDays = inclusiveDays(usage.periodStartsOn, usage.periodEndsOn);
      const spending = amountOf(usage.used);
      const limit = amountOf(usage.budget.limit);
      const projectedSpending = roundedRatio(spending * BigInt(periodDays), BigInt(elapsedDays));
      return {
        budgetId: usage.budget.id,
        categoryId: usage.budget.categoryId,
        categoryName: categoryNames.get(usage.budget.categoryId) ?? usage.budget.name,
        periodStartsOn: usage.periodStartsOn,
        periodEndsOn: usage.periodEndsOn,
        elapsedDays,
        periodDays,
        limit: idr(limit),
        spending: idr(spending),
        projectedSpending: idr(projectedSpending),
        projectedOverspend: idr(projectedSpending > limit ? projectedSpending - limit : 0n),
      };
    })
    .filter((forecast) => BigInt(forecast.projectedOverspend.amountMinor) > 0n)
    .sort((first, second) => {
      const a = BigInt(first.projectedOverspend.amountMinor);
      const b = BigInt(second.projectedOverspend.amountMinor);
      return a < b ? 1 : a > b ? -1 : 0;
    });

  const historyByCategory = new Map<string, bigint[]>();
  for (const transaction of input.historyTransactions) {
    if (
      transaction.deletedAt ||
      transaction.reviewStatus !== "confirmed" ||
      transaction.kind !== "expense" ||
      !transaction.categoryId ||
      !transaction.money
    ) {
      continue;
    }
    const amounts = historyByCategory.get(transaction.categoryId) ?? [];
    amounts.push(amountOf(transaction.money));
    historyByCategory.set(transaction.categoryId, amounts);
  }
  for (const amounts of historyByCategory.values()) {
    amounts.sort((first, second) => (first < second ? -1 : first > second ? 1 : 0));
  }

  const unusualTransactions = input.transactions
    .flatMap((transaction) => {
      if (
        transaction.deletedAt ||
        transaction.reviewStatus !== "confirmed" ||
        transaction.kind !== "expense" ||
        !transaction.categoryId ||
        !transaction.money ||
        !transaction.occurredOn ||
        transaction.occurredOn > input.asOf
      ) {
        return [];
      }
      const history = historyByCategory.get(transaction.categoryId);
      if (!history || history.length < 3) return [];
      const middle = Math.floor(history.length / 2);
      const median =
        history.length % 2 === 1
          ? (history[middle] ?? 0n)
          : roundedRatio((history[middle - 1] ?? 0n) + (history[middle] ?? 0n), 2n);
      const amount = amountOf(transaction.money);
      if (median <= 0n || amount < median * 2n) return [];
      return [
        {
          transactionId: transaction.id,
          categoryId: transaction.categoryId,
          categoryName: categoryNames.get(transaction.categoryId) ?? "Other",
          amount: idr(amount),
          historyMedian: idr(median),
          historyTransactionCount: history.length,
          multipleOfMedian: Number((amount * 100n) / median) / 100,
          severityNumerator: amount,
          severityDenominator: median,
        },
      ];
    })
    .sort((first, second) => {
      const left = first.severityNumerator * second.severityDenominator;
      const right = second.severityNumerator * first.severityDenominator;
      return left < right ? 1 : left > right ? -1 : 0;
    })
    .slice(0, 10)
    .map(
      ({ severityNumerator: _numerator, severityDenominator: _denominator, ...insight }) => insight,
    );

  return financialInsightsSchema.parse({
    asOf: input.asOf,
    savingsRate: {
      income: idr(input.income),
      spending: idr(input.spending),
      difference: signedIdr(difference),
      ratePercent: input.income > 0n ? Number((difference * 1_000n) / input.income) / 10 : null,
    },
    safeToSpend: { overall, byCategory },
    overspendForecasts,
    unusualTransactions,
  });
}

export function calculateDashboard(input: {
  month: string;
  today: string;
  transactions: Transaction[];
  budgetTransactions?: Transaction[];
  budgets: Budget[];
  categories: Category[];
  reminders: DashboardSummary["activeReminders"];
  historyTransactions?: Transaction[];
}): DashboardSummary {
  const monthStart = `${input.month}-01`;
  const monthEnd = lastDayOfMonth(input.month);
  const asOf =
    input.today < monthStart ? monthStart : input.today > monthEnd ? monthEnd : input.today;
  const confirmed = input.transactions.filter(
    (transaction) =>
      !transaction.deletedAt &&
      transaction.reviewStatus === "confirmed" &&
      transaction.occurredOn !== null &&
      transaction.occurredOn >= monthStart &&
      transaction.occurredOn <= monthEnd,
  );

  let income = 0n;
  let spending = 0n;
  const categoryTotals = new Map<string | null, bigint>();
  for (const transaction of confirmed) {
    if (!transaction.money || transaction.kind === "transfer") continue;
    const amount = amountOf(transaction.money);
    if (transaction.kind === "income") income += amount;
    if (transaction.kind === "expense") {
      spending += amount;
      categoryTotals.set(
        transaction.categoryId,
        (categoryTotals.get(transaction.categoryId) ?? 0n) + amount,
      );
    }
  }

  const budgetTransactions = input.budgetTransactions ?? confirmed;
  const budgetUsage = input.budgets.flatMap((budget) => {
    if (!budget.isActive || budget.deletedAt || asOf < budget.startsOn) return [];
    const period = budgetPeriodForDate(budget, asOf);
    return period ? [calculateBudgetUsage(budget, period, budgetTransactions)] : [];
  });
  const confirmedAsOf = confirmed.filter(
    (transaction) => transaction.occurredOn !== null && transaction.occurredOn <= asOf,
  );
  const insightBudgetTransactions = budgetTransactions.filter(
    (transaction) => transaction.occurredOn !== null && transaction.occurredOn <= asOf,
  );
  const insightBudgetUsage = input.budgets.flatMap((budget) => {
    if (!budget.isActive || budget.deletedAt || asOf < budget.startsOn) return [];
    const period = budgetPeriodForDate(budget, asOf);
    return period ? [calculateBudgetUsage(budget, period, insightBudgetTransactions)] : [];
  });
  let insightIncome = 0n;
  let insightSpending = 0n;
  for (const transaction of confirmedAsOf) {
    if (!transaction.money || transaction.kind === "transfer") continue;
    if (transaction.kind === "income") insightIncome += amountOf(transaction.money);
    if (transaction.kind === "expense") insightSpending += amountOf(transaction.money);
  }
  const remainingBudget = budgetUsage.reduce(
    (sum, usage) => sum + BigInt(usage.remaining.amountMinor),
    0n,
  );

  const categoryNames = new Map(input.categories.map((category) => [category.id, category.name]));
  const elapsedDays = Number(asOf.slice(8, 10));
  const daysInMonth = Number(monthEnd.slice(8, 10));
  const elapsedDaysExact = BigInt(elapsedDays);
  const averageDaily = (spending + elapsedDaysExact / 2n) / elapsedDaysExact;
  const projected = averageDaily * BigInt(daysInMonth);

  return dashboardSummarySchema.parse({
    month: input.month,
    income: idr(income),
    spending: idr(spending),
    difference: signedIdr(income - spending),
    remainingBudget: signedIdr(remainingBudget),
    pace: {
      asOf,
      elapsedDays,
      daysInMonth,
      averageDailySpending: idr(averageDaily),
      projectedSpending: idr(projected),
    },
    categoryBreakdown: [...categoryTotals]
      .sort((first, second) => (first[1] < second[1] ? 1 : first[1] > second[1] ? -1 : 0))
      .map(([categoryId, total]) => ({
        categoryId,
        categoryName: categoryId ? (categoryNames.get(categoryId) ?? "Other") : "Uncategorized",
        total: idr(total),
        sharePercent: spending > 0n ? Number((total * 10_000n) / spending) / 100 : 0,
      })),
    budgetUsage,
    insights: calculateFinancialInsights({
      month: input.month,
      asOf,
      income: insightIncome,
      spending: insightSpending,
      transactions: confirmedAsOf,
      historyTransactions: input.historyTransactions ?? [],
      budgetUsage: insightBudgetUsage,
      categories: input.categories,
    }),
    recentTransactions: [...confirmed]
      .sort((first, second) => {
        const date = (second.occurredOn ?? "").localeCompare(first.occurredOn ?? "");
        return date || second.createdAt.localeCompare(first.createdAt);
      })
      .slice(0, 10),
    activeReminders: input.reminders.slice(0, 10),
  });
}

const directSource = (input: FinanceCaller): TransactionSource =>
  input.directSource ?? (input.channel === "whatsapp" ? "whatsapp_text" : "in_app_chat");

const transactionValues = (transaction: Transaction): TransactionValues => ({
  kind: transaction.kind,
  merchantName: transaction.merchantName,
  money: transaction.money,
  occurredOn: transaction.occurredOn,
  occurredTime: transaction.occurredTime,
  description: transaction.description,
  location: transaction.location,
  accountHint: transaction.accountHint,
  categoryId: transaction.categoryId,
  financialAccountId: transaction.financialAccountId,
  fromFinancialAccountId: transaction.fromFinancialAccountId,
  toFinancialAccountId: transaction.toFinancialAccountId,
});

const plusMinutes = (iso: string, minutes: number) =>
  new Date(Date.parse(iso) + minutes * 60_000).toISOString();

async function fingerprint(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseConfirmationState(value: unknown): DestructiveConfirmationState {
  if (
    typeof value !== "object" ||
    value === null ||
    !("operation" in value) ||
    !("input" in value)
  ) {
    throw new FinanceOperationError("INTERNAL", "The confirmation state is invalid.");
  }
  if (value.operation === "delete_transaction") {
    return { operation: value.operation, input: deleteTransactionInputSchema.parse(value.input) };
  }
  if (value.operation === "delete_budget") {
    return { operation: value.operation, input: deleteBudgetInputSchema.parse(value.input) };
  }
  throw new FinanceOperationError("INTERNAL", "The confirmation state is invalid.");
}

const undoStateError = () =>
  new FinanceOperationError("INTERNAL", "The saved change could not be read.");

function undoString(state: Record<string, unknown>, key: string): string {
  const value = state[key];
  if (typeof value !== "string") throw undoStateError();
  return value;
}

export function createFinanceService(
  repository: FinanceRepository,
  options: { now?: () => Date } = {},
) {
  const now = () => (options.now ?? (() => new Date()))().toISOString();

  const caller = (input: FinanceCaller): FinanceCaller => ({
    channel: input.channel,
    directSource: input.directSource,
    userId: userIdSchema.parse(input.userId),
  });

  async function action(input: {
    caller: FinanceCaller;
    toolName: string;
    resourceType: ReversibleActionReceipt["resourceType"];
    resourceId: string;
    changedAt: string;
    state: ActionState;
  }) {
    return repository.recordUndoAction({
      ...input,
      userId: input.caller.userId,
      channel: input.caller.channel,
      undoExpiresAt: plusMinutes(input.changedAt, 10),
    });
  }

  async function evaluateBudgetThresholdsFor(
    userId: string,
    categoryId: string,
    occurredOn: string,
  ) {
    const budgets = await repository.listAllBudgets(userId);
    const transactionsByPeriod = new Map<string, Transaction[]>();
    for (const budget of budgets) {
      if (budget.categoryId !== categoryId || !budget.isActive || budget.deletedAt) {
        continue;
      }
      const period = budgetPeriodForDate(budget, occurredOn);
      if (!period) continue;
      const periodKey = `${period.startsOn}:${period.endsOn}`;
      let periodTransactions = transactionsByPeriod.get(periodKey);
      if (!periodTransactions) {
        periodTransactions = await repository.listTransactionsForDateRange(
          userId,
          period.startsOn,
          period.endsOn,
        );
        transactionsByPeriod.set(periodKey, periodTransactions);
      }
      const usage = calculateBudgetUsage(budget, period, periodTransactions);
      const used = BigInt(usage.used.amountMinor);
      const limit = BigInt(budget.limit.amountMinor);
      const thresholds = [...new Set([budget.warningPercent, 100])];
      for (const thresholdPercent of thresholds) {
        if (used * 100n < limit * BigInt(thresholdPercent)) continue;
        await repository.createBudgetThresholdReminder({
          userId,
          budget,
          periodStartsOn: period.startsOn,
          thresholdPercent,
          usage: usage.used,
          scheduledFor: now(),
          // Including the limit re-arms a threshold if the User raises it.
          dedupeKey: `budget:${budget.id}:${period.startsOn}:${budget.limit.amountMinor}:${thresholdPercent}`,
        });
      }
    }
  }

  async function evaluateBudgetThresholds(userId: string, transaction: Transaction) {
    if (
      transaction.deletedAt ||
      transaction.reviewStatus !== "confirmed" ||
      transaction.kind !== "expense" ||
      !transaction.categoryId ||
      !transaction.occurredOn
    ) {
      return;
    }
    await evaluateBudgetThresholdsFor(userId, transaction.categoryId, transaction.occurredOn);
  }

  async function mutateTransaction(
    operationCaller: FinanceCaller,
    toolName: string,
    previous: Transaction,
    next: Transaction,
  ): Promise<TransactionMutationResult> {
    const receipt = await action({
      caller: operationCaller,
      toolName,
      resourceType: "transaction",
      resourceId: next.id,
      changedAt: next.updatedAt,
      state: {
        operation: "restore_transaction",
        expectedUpdatedAt: next.updatedAt,
        reviewStatus: previous.reviewStatus,
        values: transactionValues(previous),
      },
    });
    await evaluateBudgetThresholds(operationCaller.userId, next);
    return transactionMutationResultSchema.parse({ transaction: next, action: receipt });
  }

  return {
    async listTransactions(operationCaller: FinanceCaller, input: unknown) {
      const verified = caller(operationCaller);
      return repository.listTransactions(verified.userId, listTransactionsInputSchema.parse(input));
    },

    async addTransaction(operationCaller: FinanceCaller, input: unknown) {
      const verified = caller(operationCaller);
      const values = createTransactionInputSchema.parse(input);
      const transaction = await repository.createTransaction({
        userId: verified.userId,
        source: directSource(verified),
        values,
      });
      const receipt = await action({
        caller: verified,
        toolName: "add_transaction",
        resourceType: "transaction",
        resourceId: transaction.id,
        changedAt: transaction.updatedAt,
        state: {
          operation: "delete_created_transaction",
          expectedUpdatedAt: transaction.updatedAt,
        },
      });
      await evaluateBudgetThresholds(verified.userId, transaction);
      return transactionMutationResultSchema.parse({ transaction, action: receipt });
    },

    async editTransaction(operationCaller: FinanceCaller, input: unknown) {
      const verified = caller(operationCaller);
      const values: UpdateTransactionInput = updateTransactionInputSchema.parse(input);
      const previous = await repository.findTransaction(verified.userId, values.transactionId);
      if (!previous || previous.deletedAt) {
        throw new FinanceOperationError("NOT_FOUND", "That transaction was not found.");
      }
      if (previous.reviewStatus !== "confirmed") {
        throw new FinanceOperationError(
          "CONFLICT",
          "Only confirmed transactions can be edited here.",
        );
      }
      const merged = confirmedTransactionValuesSchema.parse({
        ...transactionValues(previous),
        ...values.changes,
      });
      const transaction = await repository.replaceTransaction({
        userId: verified.userId,
        transactionId: values.transactionId,
        expectedUpdatedAt: values.expectedUpdatedAt,
        values: merged,
        reviewStatus: "confirmed",
      });
      return mutateTransaction(verified, "edit_transaction", previous, transaction);
    },

    async editPending(operationCaller: FinanceCaller, input: unknown) {
      const verified = caller(operationCaller);
      const values: UpdatePendingTransactionInput =
        updatePendingTransactionInputSchema.parse(input);
      const previous = await repository.findTransaction(verified.userId, values.transactionId);
      if (!previous || previous.deletedAt) {
        throw new FinanceOperationError("NOT_FOUND", "That pending transaction was not found.");
      }
      if (previous.reviewStatus !== "pending") {
        throw new FinanceOperationError(
          "CONFLICT",
          "Only pending transactions can be edited here.",
        );
      }
      const transaction = await repository.replaceTransaction({
        userId: verified.userId,
        transactionId: values.transactionId,
        expectedUpdatedAt: values.expectedUpdatedAt,
        values: { ...transactionValues(previous), ...values.changes },
        reviewStatus: "pending",
      });
      return mutateTransaction(verified, "edit_pending", previous, transaction);
    },

    async confirmPending(operationCaller: FinanceCaller, input: unknown) {
      const verified = caller(operationCaller);
      const values = confirmTransactionInputSchema.parse(input);
      const previous = await repository.findTransaction(verified.userId, values.transactionId);
      if (!previous || previous.deletedAt) {
        throw new FinanceOperationError("NOT_FOUND", "That pending transaction was not found.");
      }
      if (previous.reviewStatus !== "pending") {
        throw new FinanceOperationError("CONFLICT", "This transaction is no longer pending.");
      }
      const transaction = await repository.replaceTransaction({
        userId: verified.userId,
        transactionId: values.transactionId,
        expectedUpdatedAt: values.expectedUpdatedAt,
        values: values.values,
        reviewStatus: "confirmed",
      });
      return mutateTransaction(verified, "confirm_pending", previous, transaction);
    },

    async rejectPending(operationCaller: FinanceCaller, input: unknown) {
      const verified = caller(operationCaller);
      const values = rejectTransactionInputSchema.parse(input);
      const previous = await repository.findTransaction(verified.userId, values.transactionId);
      if (!previous || previous.deletedAt) {
        throw new FinanceOperationError("NOT_FOUND", "That pending transaction was not found.");
      }
      if (previous.reviewStatus !== "pending") {
        throw new FinanceOperationError("CONFLICT", "This transaction is no longer pending.");
      }
      const transaction = await repository.replaceTransaction({
        userId: verified.userId,
        transactionId: values.transactionId,
        expectedUpdatedAt: values.expectedUpdatedAt,
        values: transactionValues(previous),
        reviewStatus: "rejected",
      });
      return mutateTransaction(verified, "reject_pending", previous, transaction);
    },

    async deleteTransaction(operationCaller: FinanceCaller, input: unknown) {
      const verified = caller(operationCaller);
      const values = deleteTransactionInputSchema.parse(input);
      return repository.softDeleteTransaction({
        userId: verified.userId,
        transactionId: values.transactionId,
        expectedUpdatedAt: values.expectedUpdatedAt,
        deletedAt: now(),
      });
    },

    async requestDestructiveAction(
      operationCaller: FinanceCaller,
      input: unknown,
    ): Promise<DestructiveActionConfirmation> {
      const verified = caller(operationCaller);
      const request = requestDestructiveActionInputSchema.parse(input);
      const createdAt = now();
      const expiresAt = plusMinutes(createdAt, 5);

      let state: DestructiveConfirmationState;
      let resourceType: "transaction" | "budget";
      let resourceId: string;
      let summary: string;

      if (request.action === "delete_transaction") {
        const values = deleteTransactionInputSchema.parse(request.input);
        const transaction = await repository.findTransaction(verified.userId, values.transactionId);
        if (!transaction || transaction.deletedAt) {
          throw new FinanceOperationError("NOT_FOUND", "That transaction was not found.");
        }
        if (transaction.updatedAt !== values.expectedUpdatedAt) {
          throw new FinanceOperationError(
            "CONFLICT",
            "This transaction changed. Reload it and try again.",
          );
        }
        state = { operation: request.action, input: values };
        resourceType = "transaction";
        resourceId = transaction.id;
        const merchant = transaction.merchantName ?? "unknown merchant";
        const amount = transaction.money ? ` for IDR ${transaction.money.amountMinor}` : "";
        const date = transaction.occurredOn ? ` on ${transaction.occurredOn}` : "";
        summary = `Delete the ${transaction.kind} at ${merchant}${amount}${date}.`;
      } else if (request.action === "delete_budget") {
        const values = deleteBudgetInputSchema.parse(request.input);
        const budget = await repository.findBudget(verified.userId, values.budgetId);
        if (!budget || budget.deletedAt) {
          throw new FinanceOperationError("NOT_FOUND", "That Budget was not found.");
        }
        if (budget.updatedAt !== values.expectedUpdatedAt) {
          throw new FinanceOperationError(
            "CONFLICT",
            "This Budget changed. Reload it and try again.",
          );
        }
        state = { operation: request.action, input: values };
        resourceType = "budget";
        resourceId = budget.id;
        summary = `Delete the ${budget.name} Budget of IDR ${budget.limit.amountMinor}.`;
      } else {
        throw new FinanceOperationError(
          "NOT_FOUND",
          "That destructive action is not available yet.",
        );
      }

      const confirmationId = await repository.createDestructiveConfirmation({
        userId: verified.userId,
        channel: verified.channel,
        action: state.operation,
        resourceType,
        resourceId,
        requestFingerprint: await fingerprint(state),
        createdAt,
        expiresAt,
        state,
      });
      return destructiveActionConfirmationSchema.parse({
        confirmationId,
        action: state.operation,
        resourceIds: [resourceId],
        summary,
        expiresAt,
      });
    },

    async confirmDestructiveAction(operationCaller: FinanceCaller, input: unknown) {
      const verified = caller(operationCaller);
      const values = confirmDestructiveActionInputSchema.parse(input);
      const confirmation = await repository.findDestructiveConfirmation(
        verified.userId,
        values.confirmationId,
      );
      if (!confirmation) {
        throw new FinanceOperationError("NOT_FOUND", "That confirmation was not found.");
      }
      if (confirmation.consumedAt) {
        throw new FinanceOperationError("CONFLICT", "That confirmation was already used.");
      }
      const consumedAt = now();
      if (Date.parse(confirmation.expiresAt) <= Date.parse(consumedAt)) {
        throw new FinanceOperationError("CONFLICT", "That confirmation has expired.");
      }

      const state = parseConfirmationState(confirmation.state);
      if (state.operation === "delete_transaction") {
        await repository.softDeleteTransaction({
          userId: verified.userId,
          transactionId: state.input.transactionId,
          expectedUpdatedAt: state.input.expectedUpdatedAt,
          deletedAt: consumedAt,
        });
      } else {
        await repository.softDeleteBudget({
          userId: verified.userId,
          budgetId: state.input.budgetId,
          expectedUpdatedAt: state.input.expectedUpdatedAt,
          deletedAt: consumedAt,
        });
      }

      const consumed = await repository.consumeDestructiveConfirmation({
        userId: verified.userId,
        confirmationId: values.confirmationId,
        consumedAt,
      });
      if (!consumed) {
        throw new FinanceOperationError("CONFLICT", "That confirmation is no longer available.");
      }
      return { ok: true as const };
    },

    /**
     * Reverses one change from its receipt. The reversal carries the version the
     * change produced, so it fails with CONFLICT if the record changed since,
     * and a second undo of the same receipt cannot run.
     */
    async undoAction(operationCaller: FinanceCaller, input: unknown) {
      const verified = caller(operationCaller);
      const { actionId } = undoActionInputSchema.parse(input);
      const stored = await repository.findUndoAction(verified.userId, actionId);
      if (!stored) throw new FinanceOperationError("NOT_FOUND", "That change was not found.");
      if (stored.consumedAt) {
        throw new FinanceOperationError("CONFLICT", "That change was already undone.");
      }
      const undoneAt = now();
      if (Date.parse(stored.expiresAt) <= Date.parse(undoneAt)) {
        throw new FinanceOperationError("CONFLICT", "That change can no longer be undone.");
      }
      if (typeof stored.state !== "object" || stored.state === null) throw undoStateError();
      const state = stored.state as Record<string, unknown>;
      const expectedUpdatedAt = undoString(state, "expectedUpdatedAt");

      switch (state.operation) {
        case "delete_created_transaction":
          await repository.softDeleteTransaction({
            userId: verified.userId,
            transactionId: stored.resourceId,
            expectedUpdatedAt,
            deletedAt: undoneAt,
          });
          break;
        case "restore_transaction": {
          const reviewStatus = undoString(state, "reviewStatus");
          if (
            reviewStatus !== "pending" &&
            reviewStatus !== "confirmed" &&
            reviewStatus !== "rejected"
          ) {
            throw undoStateError();
          }
          const restored = await repository.replaceTransaction({
            userId: verified.userId,
            transactionId: stored.resourceId,
            expectedUpdatedAt,
            values: transactionValuesSchema.parse(state.values),
            reviewStatus,
          });
          await evaluateBudgetThresholds(verified.userId, restored);
          break;
        }
        case "delete_created_budget":
          await repository.softDeleteBudget({
            userId: verified.userId,
            budgetId: stored.resourceId,
            expectedUpdatedAt,
            deletedAt: undoneAt,
          });
          break;
        case "restore_budget": {
          const previous = budgetSchema.parse(JSON.parse(undoString(state, "values")));
          await repository.updateBudget(verified.userId, {
            budgetId: stored.resourceId,
            expectedUpdatedAt,
            changes: {
              categoryId: previous.categoryId,
              name: previous.name,
              cadence: previous.cadence,
              limit: previous.limit,
              warningPercent: previous.warningPercent,
              startsOn: previous.startsOn,
              isActive: previous.isActive,
            },
          });
          await evaluateBudgetThresholdsFor(
            verified.userId,
            previous.categoryId,
            undoneAt.slice(0, 10),
          );
          break;
        }
        default:
          // Account and Category changes are made in the app, which has no undo for them yet.
          throw new FinanceOperationError("CONFLICT", "That change can't be undone here.");
      }

      const consumed = await repository.consumeUndoAction({
        userId: verified.userId,
        actionId,
        consumedAt: undoneAt,
      });
      if (!consumed) throw new FinanceOperationError("CONFLICT", "That change was already undone.");
      return { ok: true as const };
    },

    async listFinancialAccounts(operationCaller: FinanceCaller, input: unknown) {
      const verified = caller(operationCaller);
      return repository.listFinancialAccounts(
        verified.userId,
        listFinancialAccountsInputSchema.parse(input),
      );
    },

    async createFinancialAccount(operationCaller: FinanceCaller, input: unknown) {
      const verified = caller(operationCaller);
      const financialAccount = await repository.createFinancialAccount(
        verified.userId,
        createFinancialAccountInputSchema.parse(input),
      );
      const receipt = await action({
        caller: verified,
        toolName: "create_financial_account",
        resourceType: "financial_account",
        resourceId: financialAccount.id,
        changedAt: financialAccount.updatedAt,
        state: {
          operation: "deactivate_created_financial_account",
          expectedUpdatedAt: financialAccount.updatedAt,
        },
      });
      return financialAccountMutationResultSchema.parse({ financialAccount, action: receipt });
    },

    async updateFinancialAccount(operationCaller: FinanceCaller, input: unknown) {
      const verified = caller(operationCaller);
      const values = updateFinancialAccountInputSchema.parse(input);
      const previous = (
        await repository.listFinancialAccounts(verified.userId, { limit: 100 })
      ).items.find((account) => account.id === values.financialAccountId);
      if (!previous)
        throw new FinanceOperationError("NOT_FOUND", "That Financial Account was not found.");
      const financialAccount = await repository.updateFinancialAccount(verified.userId, values);
      const receipt = await action({
        caller: verified,
        toolName: "update_financial_account",
        resourceType: "financial_account",
        resourceId: financialAccount.id,
        changedAt: financialAccount.updatedAt,
        state: {
          operation: "restore_financial_account",
          expectedUpdatedAt: financialAccount.updatedAt,
          values: JSON.stringify(previous),
        },
      });
      return financialAccountMutationResultSchema.parse({ financialAccount, action: receipt });
    },

    async listCategories(operationCaller: FinanceCaller, input: unknown) {
      const verified = caller(operationCaller);
      return repository.listCategories(verified.userId, listCategoriesInputSchema.parse(input));
    },

    async createCategory(operationCaller: FinanceCaller, input: unknown) {
      const verified = caller(operationCaller);
      const category = await repository.createCategory(
        verified.userId,
        createCategoryInputSchema.parse(input),
      );
      // Creation has no durable undo operation; do not issue a reversible receipt.
      return createCategoryResultSchema.parse({ category });
    },

    async updateCategory(operationCaller: FinanceCaller, input: unknown) {
      const verified = caller(operationCaller);
      const values = updateCategoryInputSchema.parse(input);
      const previous = (await repository.listAllCategories(verified.userId)).find(
        (category) => category.id === values.categoryId,
      );
      if (!previous) throw new FinanceOperationError("NOT_FOUND", "That Category was not found.");
      const category = await repository.updateCategory(verified.userId, values);
      const receipt = await action({
        caller: verified,
        toolName: "update_category",
        resourceType: "category",
        resourceId: category.id,
        changedAt: category.updatedAt,
        state: {
          operation: "restore_category",
          expectedUpdatedAt: category.updatedAt,
          values: JSON.stringify(previous),
        },
      });
      return categoryMutationResultSchema.parse({ category, action: receipt });
    },

    async listBudgets(operationCaller: FinanceCaller, input: unknown) {
      const verified = caller(operationCaller);
      return repository.listBudgets(verified.userId, listBudgetsInputSchema.parse(input));
    },

    async suggestBudget(operationCaller: FinanceCaller, input: unknown): Promise<BudgetSuggestion> {
      const verified = caller(operationCaller);
      const values = budgetSuggestionInputSchema.parse(input);
      const currentMonth = now().slice(0, 7);
      const range = previousThreeMonthRange(currentMonth);
      if (!range) {
        throw new FinanceOperationError("CONFLICT", "No supported history range is available.");
      }
      const { startsOn: basedOnStartsOn, endsOn: basedOnEndsOn } = range;
      const [categories, transactions] = await Promise.all([
        repository.listAllCategories(verified.userId),
        repository.listTransactionsForDateRange(verified.userId, basedOnStartsOn, basedOnEndsOn),
      ]);
      if (!categories.some((category) => category.id === values.categoryId)) {
        throw new FinanceOperationError("NOT_FOUND", "That Category was not found.");
      }

      let confirmedIncome = 0n;
      let confirmedSpending = 0n;
      for (const transaction of transactions) {
        if (
          transaction.deletedAt ||
          transaction.reviewStatus !== "confirmed" ||
          !transaction.money
        ) {
          continue;
        }
        if (transaction.kind === "income") {
          confirmedIncome += amountOf(transaction.money);
        } else if (transaction.kind === "expense" && transaction.categoryId === values.categoryId) {
          confirmedSpending += amountOf(transaction.money);
        }
      }
      if (confirmedSpending === 0n) {
        throw new FinanceOperationError(
          "CONFLICT",
          "At least one confirmed expense in the previous three full months is required.",
        );
      }

      const normalizedLimit =
        values.cadence === "monthly"
          ? roundedRatio(confirmedSpending, 3n)
          : roundedRatio(
              confirmedSpending * 7n,
              BigInt(inclusiveDays(basedOnStartsOn, basedOnEndsOn)),
            );
      const proposedLimit = normalizedLimit > 0n ? normalizedLimit : 1n;
      return budgetSuggestionSchema.parse({
        categoryId: values.categoryId,
        cadence: values.cadence,
        proposedLimit: idr(proposedLimit),
        basedOnStartsOn,
        basedOnEndsOn,
        confirmedIncome: idr(confirmedIncome),
        confirmedSpending: idr(confirmedSpending),
      });
    },

    async createBudget(operationCaller: FinanceCaller, input: unknown) {
      const verified = caller(operationCaller);
      const budget = await repository.createBudget(
        verified.userId,
        createBudgetInputSchema.parse(input),
      );
      const receipt = await action({
        caller: verified,
        toolName: "create_budget",
        resourceType: "budget",
        resourceId: budget.id,
        changedAt: budget.updatedAt,
        state: { operation: "delete_created_budget", expectedUpdatedAt: budget.updatedAt },
      });
      await evaluateBudgetThresholdsFor(verified.userId, budget.categoryId, now().slice(0, 10));
      return budgetMutationResultSchema.parse({ budget, action: receipt });
    },

    async updateBudget(operationCaller: FinanceCaller, input: unknown) {
      const verified = caller(operationCaller);
      const values: UpdateBudgetInput = updateBudgetInputSchema.parse(input);
      const previous = await repository.findBudget(verified.userId, values.budgetId);
      if (!previous || previous.deletedAt) {
        throw new FinanceOperationError("NOT_FOUND", "That Budget was not found.");
      }
      const budget = await repository.updateBudget(verified.userId, values);
      const receipt = await action({
        caller: verified,
        toolName: "edit_budget",
        resourceType: "budget",
        resourceId: budget.id,
        changedAt: budget.updatedAt,
        state: {
          operation: "restore_budget",
          expectedUpdatedAt: budget.updatedAt,
          values: JSON.stringify(previous),
        },
      });
      await evaluateBudgetThresholdsFor(verified.userId, budget.categoryId, now().slice(0, 10));
      return budgetMutationResultSchema.parse({ budget, action: receipt });
    },

    async deleteBudget(operationCaller: FinanceCaller, input: unknown) {
      const verified = caller(operationCaller);
      const values = deleteBudgetInputSchema.parse(input);
      return repository.softDeleteBudget({
        userId: verified.userId,
        budgetId: values.budgetId,
        expectedUpdatedAt: values.expectedUpdatedAt,
        deletedAt: now(),
      });
    },

    async listBudgetUsage(operationCaller: FinanceCaller, input: unknown) {
      const verified = caller(operationCaller);
      const parsed = getDashboardInputSchema.parse(input);
      const budgets = await repository.listAllBudgets(verified.userId);
      const today = now().slice(0, 10);
      const monthStart = `${parsed.month}-01`;
      const monthEnd = lastDayOfMonth(parsed.month);
      const date = today < monthStart ? monthStart : today > monthEnd ? monthEnd : today;
      const coverage = budgetReadRange(budgets, parsed.month, date);
      const transactions = await repository.listTransactionsForDateRange(
        verified.userId,
        coverage.startsOn,
        coverage.endsOn,
      );
      return budgets.flatMap((budget) => {
        if (!budget.isActive || budget.deletedAt) return [];
        const period = budgetPeriodForDate(budget, date);
        return period ? [calculateBudgetUsage(budget, period, transactions)] : [];
      });
    },

    async listReminders(operationCaller: FinanceCaller, input: unknown) {
      const verified = caller(operationCaller);
      return repository.listReminders(verified.userId, listRemindersInputSchema.parse(input));
    },

    async markReminderRead(operationCaller: FinanceCaller, input: unknown) {
      const verified = caller(operationCaller);
      const parsed: MarkReminderReadInput = markReminderReadInputSchema.parse(input);
      const previous = await repository.findReminder(verified.userId, parsed.reminderId);
      if (!previous) throw new FinanceOperationError("NOT_FOUND", "Notification not found.");
      // A retry after a lost response is safe; it cannot overwrite a dismissal.
      if (previous.status === "read") return previous;
      if (previous.status !== parsed.expectedStatus) {
        throw new FinanceOperationError(
          "CONFLICT",
          "This notification changed. Refresh it and try again.",
        );
      }
      return repository.updateReminder({
        userId: verified.userId,
        reminderId: parsed.reminderId,
        expectedStatus: previous.status,
        status: "read",
        readAt: now(),
      });
    },

    async dismissReminder(operationCaller: FinanceCaller, input: unknown) {
      const verified = caller(operationCaller);
      const parsed: DismissReminderInput = dismissReminderInputSchema.parse(input);
      const previous = await repository.findReminder(verified.userId, parsed.reminderId);
      if (!previous) throw new FinanceOperationError("NOT_FOUND", "Notification not found.");
      if (previous.status === "dismissed") return previous;
      if (previous.status !== parsed.expectedStatus) {
        throw new FinanceOperationError(
          "CONFLICT",
          "This notification changed. Refresh it and try again.",
        );
      }
      return repository.updateReminder({
        userId: verified.userId,
        reminderId: parsed.reminderId,
        expectedStatus: previous.status,
        status: "dismissed",
        readAt: previous.readAt,
      });
    },

    async getDashboard(operationCaller: FinanceCaller, input: unknown) {
      const verified = caller(operationCaller);
      const parsed: GetDashboardInput = getDashboardInputSchema.parse(input);
      const today = now().slice(0, 10);
      const historyRange = previousThreeMonthRange(parsed.month);
      const [transactions, budgets, categories, reminders, historyTransactions] = await Promise.all(
        [
          repository.listTransactionsForMonth(verified.userId, parsed.month),
          repository.listAllBudgets(verified.userId),
          repository.listAllCategories(verified.userId),
          repository.listUnreadReminders(verified.userId, 10),
          historyRange
            ? repository.listTransactionsForDateRange(
                verified.userId,
                historyRange.startsOn,
                historyRange.endsOn,
              )
            : Promise.resolve([]),
        ],
      );
      const monthStart = `${parsed.month}-01`;
      const monthEnd = lastDayOfMonth(parsed.month);
      const asOf = today < monthStart ? monthStart : today > monthEnd ? monthEnd : today;
      const coverage = budgetReadRange(budgets, parsed.month, asOf);
      const budgetTransactions = await repository.listTransactionsForDateRange(
        verified.userId,
        coverage.startsOn,
        coverage.endsOn,
      );
      return calculateDashboard({
        month: parsed.month,
        today,
        transactions,
        budgetTransactions,
        budgets,
        categories,
        reminders,
        historyTransactions,
      });
    },
  };
}

export type FinanceService = ReturnType<typeof createFinanceService>;
