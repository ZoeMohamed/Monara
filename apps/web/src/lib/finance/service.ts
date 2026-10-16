import type { FinanceCaller, FinanceService } from "@monara/core";
import {
  createFinanceService,
  createSupabaseFinanceRepository as createRepository,
  FinanceOperationError,
} from "@monara/core";
import { createMonaraServiceRoleClient } from "@monara/db";

import { publicSupabaseConfig } from "@/lib/supabase/config";

const FINANCE_OPERATIONS = [
  "list_transactions",
  "add_transaction",
  "edit_transaction",
  "edit_pending",
  "confirm_pending",
  "reject_pending",
  "delete_transaction",
  "list_financial_accounts",
  "create_financial_account",
  "update_financial_account",
  "list_categories",
  "create_category",
  "update_category",
  "list_budgets",
  "suggest_budget",
  "create_budget",
  "edit_budget",
  "delete_budget",
  "list_budget_usage",
  "list_reminders",
  "mark_reminder_read",
  "dismiss_reminder",
  "get_dashboard",
] as const;

export type FinanceOperation = (typeof FINANCE_OPERATIONS)[number];
type AgentFinanceOperation = Exclude<
  FinanceOperation,
  | "create_category"
  | "delete_transaction"
  | "delete_budget"
  | "mark_reminder_read"
  | "dismiss_reminder"
>;
const AGENT_CONFIRMATION_OPERATIONS = [
  "request_destructive_action",
  "confirm_destructive_action",
  "undo_action",
] as const;
type AgentConfirmationOperation = (typeof AGENT_CONFIRMATION_OPERATIONS)[number];
export type AgentOperation = AgentFinanceOperation | AgentConfirmationOperation;

function financeService(): FinanceService {
  const client = createMonaraServiceRoleClient(
    publicSupabaseConfig(),
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  return createFinanceService(createRepository(client));
}

export function isFinanceOperation(value: string): value is FinanceOperation {
  return (FINANCE_OPERATIONS as readonly string[]).includes(value);
}

function isAgentFinanceOperation(value: FinanceOperation): value is AgentFinanceOperation {
  return (
    value !== "create_category" &&
    value !== "delete_transaction" &&
    value !== "delete_budget" &&
    value !== "mark_reminder_read" &&
    value !== "dismiss_reminder"
  );
}

export function isAgentOperation(value: string): value is AgentOperation {
  return (
    (isFinanceOperation(value) && isAgentFinanceOperation(value)) ||
    (AGENT_CONFIRMATION_OPERATIONS as readonly string[]).includes(value)
  );
}

export async function runFinanceOperation(
  operation: FinanceOperation,
  caller: FinanceCaller,
  input: unknown,
): Promise<unknown> {
  const service = financeService();
  switch (operation) {
    case "list_transactions":
      return service.listTransactions(caller, input);
    case "add_transaction":
      return service.addTransaction(caller, input);
    case "edit_transaction":
      return service.editTransaction(caller, input);
    case "edit_pending":
      return service.editPending(caller, input);
    case "confirm_pending":
      return service.confirmPending(caller, input);
    case "reject_pending":
      return service.rejectPending(caller, input);
    case "delete_transaction":
      return service.deleteTransaction(caller, input);
    case "list_financial_accounts":
      return service.listFinancialAccounts(caller, input);
    case "create_financial_account":
      return service.createFinancialAccount(caller, input);
    case "update_financial_account":
      return service.updateFinancialAccount(caller, input);
    case "list_categories":
      return service.listCategories(caller, input);
    case "create_category":
      return service.createCategory(caller, input);
    case "update_category":
      return service.updateCategory(caller, input);
    case "list_budgets":
      return service.listBudgets(caller, input);
    case "suggest_budget":
      return service.suggestBudget(caller, input);
    case "create_budget":
      return service.createBudget(caller, input);
    case "edit_budget":
      return service.updateBudget(caller, input);
    case "delete_budget":
      return service.deleteBudget(caller, input);
    case "list_budget_usage":
      return service.listBudgetUsage(caller, input);
    case "list_reminders":
      return service.listReminders(caller, input);
    case "mark_reminder_read":
      return service.markReminderRead(caller, input);
    case "dismiss_reminder":
      return service.dismissReminder(caller, input);
    case "get_dashboard":
      return service.getDashboard(caller, input);
  }
}

export async function runAgentOperation(
  operation: AgentOperation,
  caller: FinanceCaller,
  input: unknown,
): Promise<unknown> {
  if (operation === "request_destructive_action") {
    return financeService().requestDestructiveAction(caller, input);
  }
  if (operation === "confirm_destructive_action") {
    return financeService().confirmDestructiveAction(caller, input);
  }
  if (operation === "undo_action") {
    return financeService().undoAction(caller, input);
  }
  return runFinanceOperation(operation, caller, input);
}

const STATUS = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  DEPENDENCY_UNAVAILABLE: 503,
} as const;

const noStore = { "Cache-Control": "private, no-store" };

export function financeErrorResponse(error: unknown): Response {
  if (error instanceof FinanceOperationError) {
    return Response.json(
      { code: error.code, message: error.message, requestId: null },
      { status: STATUS[error.code], headers: noStore },
    );
  }
  if (error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError")) {
    return Response.json(
      { code: "VALIDATION_FAILED", message: "The request is not valid.", requestId: null },
      { status: 400, headers: noStore },
    );
  }
  return Response.json(
    { code: "INTERNAL", message: "The operation could not be completed.", requestId: null },
    { status: 500, headers: noStore },
  );
}

export function financeSuccessResponse(value: unknown): Response {
  return Response.json(value, { headers: noStore });
}
