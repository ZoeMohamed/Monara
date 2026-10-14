import {
  type Budget,
  type BudgetPage,
  type BudgetUsage,
  budgetMutationResultSchema,
  budgetUsageSchema,
  type Category,
  type CategoryPage,
  type CreateBudgetInput,
  type CreateFinancialAccountInput,
  type CreateTransactionInput,
  categoryMutationResultSchema,
  confirmDestructiveActionInputSchema,
  confirmedTransactionValuesSchema,
  confirmTransactionInputSchema,
  createBudgetInputSchema,
  createFinancialAccountInputSchema,
  createTransactionInputSchema,
  type DashboardSummary,
  type DeleteBudgetInput,
  type DeleteTransactionInput,
  type DestructiveActionConfirmation,
  dashboardSummarySchema,
  deleteBudgetInputSchema,
  deleteTransactionInputSchema,
  destructiveActionConfirmationSchema,
  type FinancialAccount,
  type FinancialAccountPage,
  financialAccountMutationResultSchema,
  type GetDashboardInput,
  getDashboardInputSchema,
  type ListBudgetsInput,
  type ListCategoriesInput,
  type ListFinancialAccountsInput,
  type ListTransactionsInput,
  listBudgetsInputSchema,
  listCategoriesInputSchema,
  listFinancialAccountsInputSchema,
  listTransactionsInputSchema,
  type Money,
  type OperationErrorCode,
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
  type UpdateBudgetInput,
  type UpdateCategoryInput,
  type UpdateFinancialAccountInput,
  type UpdatePendingTransactionInput,
  type UpdateTransactionInput,
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

function addUtcDays(value: string, days: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function daysBetween(first: string, second: string): number {
  return Math.round((parseDate(second).getTime() - parseDate(first).getTime()) / 86_400_000);
}

function lastDayOfMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return formatDate(new Date(Date.UTC(year, monthNumber, 0)));
}

export function budgetPeriodForDate(
  budget: Pick<Budget, "cadence" | "startsOn">,
  date: string,
): { startsOn: string; endsOn: string } | null {
  if (date < budget.startsOn) return null;
  if (budget.cadence === "monthly") {
    const month = date.slice(0, 7);
    return { startsOn: `${month}-01`, endsOn: lastDayOfMonth(month) };
  }

  const periodIndex = Math.floor(daysBetween(budget.startsOn, date) / 7);
  const startsOn = addUtcDays(budget.startsOn, periodIndex * 7);
  return { startsOn, endsOn: addUtcDays(startsOn, 6) };
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

export function calculateDashboard(input: {
  month: string;
  today: string;
  transactions: Transaction[];
  budgetTransactions?: Transaction[];
  budgets: Budget[];
  categories: Category[];
  reminders: DashboardSummary["activeReminders"];
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

  const budgetUsage = input.budgets.flatMap((budget) => {
    if (!budget.isActive || budget.deletedAt || asOf < budget.startsOn) return [];
    const period = budgetPeriodForDate(budget, asOf);
    return period
      ? [calculateBudgetUsage(budget, period, input.budgetTransactions ?? confirmed)]
      : [];
  });
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
      const [budgets, transactions] = await Promise.all([
        repository.listAllBudgets(verified.userId),
        repository.listTransactionsForDateRange(
          verified.userId,
          addUtcDays(`${parsed.month}-01`, -6),
          lastDayOfMonth(parsed.month),
        ),
      ]);
      const date =
        parsed.month === now().slice(0, 7) ? now().slice(0, 10) : lastDayOfMonth(parsed.month);
      return budgets.flatMap((budget) => {
        const period = budgetPeriodForDate(budget, date);
        return period && budget.isActive && !budget.deletedAt
          ? [calculateBudgetUsage(budget, period, transactions)]
          : [];
      });
    },

    async getDashboard(operationCaller: FinanceCaller, input: unknown) {
      const verified = caller(operationCaller);
      const parsed: GetDashboardInput = getDashboardInputSchema.parse(input);
      const [transactions, budgetTransactions, budgets, categories, reminders] = await Promise.all([
        repository.listTransactionsForMonth(verified.userId, parsed.month),
        repository.listTransactionsForDateRange(
          verified.userId,
          addUtcDays(`${parsed.month}-01`, -6),
          lastDayOfMonth(parsed.month),
        ),
        repository.listAllBudgets(verified.userId),
        repository.listAllCategories(verified.userId),
        repository.listUnreadReminders(verified.userId, 10),
      ]);
      return calculateDashboard({
        month: parsed.month,
        today: now().slice(0, 10),
        transactions,
        budgetTransactions,
        budgets,
        categories,
        reminders,
      });
    },
  };
}

export type FinanceService = ReturnType<typeof createFinanceService>;
