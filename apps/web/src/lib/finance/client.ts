import {
  budgetMutationResultSchema,
  budgetPageSchema,
  budgetSchema,
  budgetSuggestionInputSchema,
  budgetSuggestionSchema,
  budgetUsageSchema,
  categoryMutationResultSchema,
  categoryPageSchema,
  confirmTransactionInputSchema,
  createBudgetInputSchema,
  createCategoryInputSchema,
  createCategoryResultSchema,
  createFinancialAccountInputSchema,
  createTransactionInputSchema,
  dashboardSummarySchema,
  deleteBudgetInputSchema,
  deleteTransactionInputSchema,
  dismissReminderInputSchema,
  excludeTransactionInputSchema,
  financialAccountMutationResultSchema,
  financialAccountPageSchema,
  getDashboardInputSchema,
  listBudgetsInputSchema,
  listCategoriesInputSchema,
  listFinancialAccountsInputSchema,
  listRemindersInputSchema,
  listTransactionsInputSchema,
  markReminderReadInputSchema,
  type OperationErrorCode,
  operationErrorSchema,
  reminderPageSchema,
  reminderSchema,
  transactionMutationResultSchema,
  transactionPageSchema,
  transactionSchema,
  updateBudgetInputSchema,
  updateCategoryInputSchema,
  updateFinancialAccountInputSchema,
  updatePendingTransactionInputSchema,
  updateTransactionInputSchema,
} from "@monara/contracts";

const operations = {
  list_transactions: { input: listTransactionsInputSchema, output: transactionPageSchema },
  list_financial_accounts: {
    input: listFinancialAccountsInputSchema,
    output: financialAccountPageSchema,
  },
  create_financial_account: {
    input: createFinancialAccountInputSchema,
    output: financialAccountMutationResultSchema,
  },
  update_financial_account: {
    input: updateFinancialAccountInputSchema,
    output: financialAccountMutationResultSchema,
  },
  list_categories: { input: listCategoriesInputSchema, output: categoryPageSchema },
  create_category: { input: createCategoryInputSchema, output: createCategoryResultSchema },
  update_category: { input: updateCategoryInputSchema, output: categoryMutationResultSchema },
  list_budgets: { input: listBudgetsInputSchema, output: budgetPageSchema },
  suggest_budget: { input: budgetSuggestionInputSchema, output: budgetSuggestionSchema },
  list_budget_usage: { input: getDashboardInputSchema, output: budgetUsageSchema.array() },
  list_reminders: { input: listRemindersInputSchema, output: reminderPageSchema },
  mark_reminder_read: { input: markReminderReadInputSchema, output: reminderSchema },
  dismiss_reminder: { input: dismissReminderInputSchema, output: reminderSchema },
  create_budget: { input: createBudgetInputSchema, output: budgetMutationResultSchema },
  edit_budget: { input: updateBudgetInputSchema, output: budgetMutationResultSchema },
  delete_budget: { input: deleteBudgetInputSchema, output: budgetSchema },
  get_dashboard: { input: getDashboardInputSchema, output: dashboardSummarySchema },
  add_transaction: { input: createTransactionInputSchema, output: transactionMutationResultSchema },
  edit_transaction: {
    input: updateTransactionInputSchema,
    output: transactionMutationResultSchema,
  },
  edit_pending: {
    input: updatePendingTransactionInputSchema,
    output: transactionMutationResultSchema,
  },
  confirm_pending: {
    input: confirmTransactionInputSchema,
    output: transactionMutationResultSchema,
  },
  exclude_pending: {
    input: excludeTransactionInputSchema,
    output: transactionMutationResultSchema,
  },
  delete_transaction: { input: deleteTransactionInputSchema, output: transactionSchema },
} as const;

export type FinanceClientOperation = keyof typeof operations;
export type FinanceOperationResult<Operation extends FinanceClientOperation> = ReturnType<
  (typeof operations)[Operation]["output"]["parse"]
>;
type FinanceFetch = (input: string, init: RequestInit) => Promise<Response>;

export class FinanceClientError extends Error {
  readonly code: OperationErrorCode;
  readonly status: number | null;
  readonly actionMayHaveCompleted: boolean;
  readonly fieldErrors: Record<string, string[]> | undefined;

  constructor(
    code: OperationErrorCode,
    message: string,
    status: number | null,
    actionMayHaveCompleted = false,
    fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "FinanceClientError";
    this.code = code;
    this.status = status;
    this.actionMayHaveCompleted = actionMayHaveCompleted;
    this.fieldErrors = fieldErrors;
  }
}

/** Validates both sides of the cookie-authenticated, non-cached financial boundary. */
export async function callFinanceOperation<Operation extends FinanceClientOperation>(
  operation: Operation,
  input: unknown,
  fetcher: FinanceFetch = fetch,
): Promise<FinanceOperationResult<Operation>> {
  const parsedInput = operations[operation].input.safeParse(input);
  if (!parsedInput.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsedInput.error.issues) {
      const field = issue.path.map(String).join(".");
      if (field) {
        fieldErrors[field] ??= [];
        fieldErrors[field].push(issue.message);
      }
    }
    throw new FinanceClientError(
      "VALIDATION_FAILED",
      "Check the marked fields.",
      null,
      false,
      fieldErrors,
    );
  }
  const mutation =
    !operation.startsWith("list_") &&
    operation !== "get_dashboard" &&
    operation !== "suggest_budget";
  let response: Response;
  try {
    response = await fetcher(`/api/finance/operations/${operation}`, {
      body: JSON.stringify(parsedInput.data),
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new FinanceClientError(
      "DEPENDENCY_UNAVAILABLE",
      mutation
        ? "The result could not be verified. Refresh your records before trying again."
        : "Your records could not be loaded. Please try again.",
      null,
      mutation,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new FinanceClientError(
      "DEPENDENCY_UNAVAILABLE",
      "The result could not be verified. Refresh your records before trying again.",
      response.status,
      mutation,
    );
  }
  if (!response.ok) {
    const error = operationErrorSchema.safeParse(body);
    if (error.success) {
      throw new FinanceClientError(
        error.data.code,
        error.data.message,
        response.status,
        mutation && response.status >= 500,
        error.data.fieldErrors,
      );
    }
    throw new FinanceClientError(
      "DEPENDENCY_UNAVAILABLE",
      "The operation could not be verified. Refresh your records before trying again.",
      response.status,
      mutation,
    );
  }

  const result = operations[operation].output.safeParse(body);
  if (!result.success) {
    throw new FinanceClientError(
      "DEPENDENCY_UNAVAILABLE",
      "The result could not be verified. Refresh your records before trying again.",
      response.status,
      mutation,
    );
  }
  return result.data as FinanceOperationResult<Operation>;
}
