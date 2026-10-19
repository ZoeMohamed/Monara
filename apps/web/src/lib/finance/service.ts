import type { FinanceCaller, FinanceService } from "@monara/core";
import {
  createFinanceService,
  createSupabaseFinanceRepository as createRepository,
  FinanceOperationError,
} from "@monara/core";
import { createMonaraServiceRoleClient } from "@monara/db";
import { requireActiveUser } from "@/lib/auth/user-deletion";
import { publicSupabaseConfig } from "@/lib/supabase/config";
import { scheduleBudgetAlert } from "@/lib/whatsapp/budget-alerts";
import { reviewBillsWithAgent } from "../bills/review.ts";
import { GOAL_IMAGE_BUCKET } from "../goals/image.ts";

const FINANCE_OPERATIONS = [
  "list_transactions",
  "add_transaction",
  "edit_transaction",
  "edit_pending",
  "confirm_pending",
  "exclude_pending",
  "delete_transaction",
  "undo_action",
  "list_financial_accounts",
  "create_financial_account",
  "update_financial_account",
  "list_financial_goals",
  "create_financial_goal",
  "edit_financial_goal",
  "delete_financial_goal",
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
  "list_recurring_bills",
  "suggest_recurring_bills",
  "confirm_recurring_bill",
  "dismiss_recurring_bill_suggestion",
] as const;

async function cleanUpDeletedGoalImage(remove: () => Promise<{ error: unknown }>): Promise<void> {
  try {
    const cleanup = await remove();
    if (!cleanup.error) return;
  } catch {
    // The goal is already soft-deleted, so storage cleanup cannot roll it back.
  }
  process.emitWarning("A deleted goal image could not be cleaned up.", {
    code: "MONARA_GOAL_IMAGE_CLEANUP_FAILED",
  });
}

export type FinanceOperation = (typeof FINANCE_OPERATIONS)[number];
type AgentFinanceOperation = Exclude<
  FinanceOperation,
  | "create_category"
  | "list_financial_goals"
  | "create_financial_goal"
  | "edit_financial_goal"
  | "delete_financial_goal"
  | "delete_transaction"
  | "delete_budget"
  | "mark_reminder_read"
  | "dismiss_reminder"
  | "list_recurring_bills"
  | "suggest_recurring_bills"
  | "confirm_recurring_bill"
  | "dismiss_recurring_bill_suggestion"
>;
const AGENT_CONFIRMATION_OPERATIONS = [
  "request_destructive_action",
  "confirm_destructive_action",
  "undo_action",
  "add_receipt_transaction",
] as const;
type AgentConfirmationOperation = (typeof AGENT_CONFIRMATION_OPERATIONS)[number];
export type AgentOperation = AgentFinanceOperation | AgentConfirmationOperation;

function financeBackend() {
  const client = createMonaraServiceRoleClient(
    publicSupabaseConfig(),
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const service = createFinanceService(createRepository(client), {
    onBudgetReminder: scheduleBudgetAlert,
    reviewBills: reviewBillsWithAgent({
      agentUrl: process.env.MONARA_AGENT_URL,
      secret: process.env.MONARA_AGENT_BACKEND_SECRET,
    }),
  });
  return { client, service };
}

function financeService(): FinanceService {
  return financeBackend().service;
}

/** Budget follow-up for Gmail imports confirmed without review. See evaluateConfirmedImports. */
export function evaluateConfirmedGmailImports(userId: string, transactionIds: readonly string[]) {
  return financeService().evaluateConfirmedImports(userId, transactionIds);
}

export function isFinanceOperation(value: string): value is FinanceOperation {
  return (FINANCE_OPERATIONS as readonly string[]).includes(value);
}

function isAgentFinanceOperation(value: FinanceOperation): value is AgentFinanceOperation {
  return (
    value !== "create_category" &&
    value !== "list_financial_goals" &&
    value !== "create_financial_goal" &&
    value !== "edit_financial_goal" &&
    value !== "delete_financial_goal" &&
    value !== "delete_transaction" &&
    value !== "delete_budget" &&
    value !== "mark_reminder_read" &&
    value !== "dismiss_reminder" &&
    value !== "list_recurring_bills" &&
    value !== "suggest_recurring_bills" &&
    value !== "confirm_recurring_bill" &&
    value !== "dismiss_recurring_bill_suggestion"
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
  await requireActiveUser(caller.userId);
  const { client, service } = financeBackend();
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
    case "exclude_pending":
      return service.excludePending(caller, input);
    case "delete_transaction":
      return service.deleteTransaction(caller, input);
    case "undo_action":
      return service.undoAction(caller, input);
    case "list_financial_accounts":
      return service.listFinancialAccounts(caller, input);
    case "create_financial_account":
      return service.createFinancialAccount(caller, input);
    case "update_financial_account":
      return service.updateFinancialAccount(caller, input);
    case "list_financial_goals":
      return service.listFinancialGoals(caller, input);
    case "create_financial_goal":
      return service.createFinancialGoal(caller, input);
    case "edit_financial_goal":
      return service.updateFinancialGoal(caller, input);
    case "delete_financial_goal": {
      const goal = await service.deleteFinancialGoal(caller, input);
      const deletedImagePath = goal.imagePath;
      if (deletedImagePath)
        await cleanUpDeletedGoalImage(() =>
          client.storage.from(GOAL_IMAGE_BUCKET).remove([deletedImagePath]),
        );
      return goal;
    }
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
    case "list_recurring_bills":
      return service.listRecurringBills(caller, input);
    case "suggest_recurring_bills":
      return service.suggestRecurringBills(caller, input);
    case "confirm_recurring_bill":
      return service.confirmRecurringBill(caller, input);
    case "dismiss_recurring_bill_suggestion":
      return service.dismissRecurringBillSuggestion(caller, input);
  }
}

export async function runAgentOperation(
  operation: AgentOperation,
  caller: FinanceCaller,
  input: unknown,
): Promise<unknown> {
  await requireActiveUser(caller.userId);
  if (operation === "request_destructive_action") {
    return financeService().requestDestructiveAction(caller, input);
  }
  if (operation === "confirm_destructive_action") {
    return financeService().confirmDestructiveAction(caller, input);
  }
  if (operation === "undo_action") {
    return financeService().undoAction(caller, input);
  }
  if (operation === "add_receipt_transaction") {
    return financeService().addReceiptTransaction(caller, input);
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
