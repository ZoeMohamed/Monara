import {
  budgetPageSchema,
  categoryPageSchema,
  financialAccountPageSchema,
  listBudgetsInputSchema,
  listCategoriesInputSchema,
  listFinancialAccountsInputSchema,
  listRecurringBillsInputSchema,
  listRemindersInputSchema,
  listTransactionsInputSchema,
  recurringBillPageSchema,
  reminderPageSchema,
  transactionPageSchema,
} from "@monara/contracts";
import type { z } from "zod";
import type { AgentTool } from "./tools.ts";

/**
 * A T0 tool that forwards to one backend list operation. The result is parsed
 * with the shared contract, so the model never sees a field the contract does
 * not expose.
 */
function readTool<Input extends z.ZodType>(config: {
  name: string;
  description: string;
  input: Input;
  output: z.ZodType;
}): AgentTool<Input> {
  return {
    name: config.name,
    description: config.description,
    tier: "T0",
    input: config.input,
    async run(input, context) {
      return config.output.parse(await context.callOperation(config.name, context.userId, input));
    },
  };
}

const PAGING = "Results are paged: pass the returned nextCursor as cursor to get more.";

export const readTools = [
  readTool({
    name: "list_transactions",
    description: `Lists the User's transactions, newest first. Filter by month (YYYY-MM), kind (expense, income, transfer), or reviewStatus. Only confirmed transactions count towards totals, so pass reviewStatus confirmed when adding amounts up; pending ones are still waiting in the Review Queue. ${PAGING}`,
    input: listTransactionsInputSchema,
    output: transactionPageSchema,
  }),
  readTool({
    name: "list_financial_accounts",
    description: `Lists the User's Financial Accounts (bank, wallet, cash). Use it to turn an account id into a name. ${PAGING}`,
    input: listFinancialAccountsInputSchema,
    output: financialAccountPageSchema,
  }),
  readTool({
    name: "list_categories",
    description: `Lists the User's Categories. Use it to turn a category id into a name. ${PAGING}`,
    input: listCategoriesInputSchema,
    output: categoryPageSchema,
  }),
  readTool({
    name: "list_budgets",
    description: `Lists the User's Budgets with their limit and cadence (weekly or monthly). ${PAGING}`,
    input: listBudgetsInputSchema,
    output: budgetPageSchema,
  }),
  readTool({
    name: "list_recurring_bills",
    description: `Lists the User's recurring bills and when each is next due. ${PAGING}`,
    input: listRecurringBillsInputSchema,
    output: recurringBillPageSchema,
  }),
  readTool({
    name: "list_reminders",
    description: `Lists the User's Reminders: budget threshold alerts and bills coming due. ${PAGING}`,
    input: listRemindersInputSchema,
    output: reminderPageSchema,
  }),
] satisfies AgentTool[];
