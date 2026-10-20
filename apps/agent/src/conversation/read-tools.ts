import {
  budgetPageSchema,
  budgetSuggestionInputSchema,
  budgetSuggestionSchema,
  calendarMonthSchema,
  categoryPageSchema,
  dashboardSummarySchema,
  financialAccountPageSchema,
  forecastResponseSchema,
  getDashboardInputSchema,
  listBudgetsInputSchema,
  listCategoriesInputSchema,
  listFinancialAccountsInputSchema,
  listRemindersInputSchema,
  listTransactionsInputSchema,
  reminderPageSchema,
  transactionPageSchema,
  transactionReportingMoney,
} from "@monara/contracts";
import { z } from "zod";
import type { AgentTool, ToolContext } from "./tools.ts";

/**
 * A T0 tool that forwards to one backend read operation. The result is parsed
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
      return config.output.parse(await context.callOperation(config.name, context, input));
    },
  };
}

const PAGING = "Results are paged: pass the returned nextCursor as cursor to get more.";

const idr = (amount: bigint) => ({ amountMinor: amount.toString(), currency: "IDR" as const });

// 2,000 confirmed transactions in one month is far beyond a personal ledger.
const MAX_SUMMARY_PAGES = 20;

/** Adds up one month in exact integer rupiah, reading every page of confirmed transactions. */
async function summariseMonth(month: string, context: ToolContext) {
  let income = 0n;
  let spending = 0n;
  let transactionCount = 0;
  const byCategory = new Map<string | null, bigint>();
  let cursor: string | null = null;
  for (let page = 0; page < MAX_SUMMARY_PAGES; page++) {
    const result = transactionPageSchema.parse(
      await context.callOperation("list_transactions", context, {
        month,
        reviewStatus: "confirmed",
        limit: 100,
        cursor,
      }),
    );
    for (const transaction of result.items) {
      const reportingMoney = transactionReportingMoney(transaction);
      if (!reportingMoney || transaction.deletedAt || transaction.kind === "exclusion") continue;
      const amount = BigInt(reportingMoney.amountMinor);
      transactionCount += 1;
      if (transaction.kind === "income") {
        income += amount;
      } else if (transaction.kind === "expense") {
        spending += amount;
        const category = transaction.categoryId;
        byCategory.set(category, (byCategory.get(category) ?? 0n) + amount);
      }
    }
    cursor = result.nextCursor;
    if (!cursor) {
      return { month, income, spending, transactionCount, byCategory };
    }
  }
  throw new Error("Too many transactions to summarise.");
}

const getSummaryInputSchema = z
  .object({ months: z.array(calendarMonthSchema).min(1).max(12) })
  .strict();

const getSummary: AgentTool<typeof getSummaryInputSchema> = {
  name: "get_summary",
  description:
    "Adds up the User's confirmed income and spending for each given month (YYYY-MM): totals, the difference, the savings rate, and spending by Category, plus the totals and average monthly spending across all the months given. Excluded records are not counted. Use this for every total or average.",
  tier: "T0",
  input: getSummaryInputSchema,
  async run(input, context) {
    const months = [];
    for (const month of [...new Set(input.months)].sort()) {
      months.push(await summariseMonth(month, context));
    }
    const income = months.reduce((sum, month) => sum + month.income, 0n);
    const spending = months.reduce((sum, month) => sum + month.spending, 0n);
    const count = BigInt(months.length);
    return {
      months: months.map((month) => ({
        month: month.month,
        income: idr(month.income),
        spending: idr(month.spending),
        difference: idr(month.income - month.spending),
        // One decimal place, worked out in integers so it is exact.
        savingsRatePercent:
          month.income > 0n
            ? Number(((month.income - month.spending) * 1000n) / month.income) / 10
            : null,
        transactionCount: month.transactionCount,
        spendingByCategory: [...month.byCategory]
          .sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0))
          .map(([categoryId, total]) => ({ categoryId, total: idr(total) })),
      })),
      allMonths: {
        income: idr(income),
        spending: idr(spending),
        difference: idr(income - spending),
        averageMonthlySpending: idr((spending + count / 2n) / count),
      },
    };
  },
};

export const readTools = [
  getSummary,
  readTool({
    name: "get_dashboard",
    description:
      "Reads the backend-calculated dashboard for a month (YYYY-MM). Use it for affordability questions such as 'Can I afford this?', overall and per-Category safe-to-spend, overspend forecasts, unusual-transaction flags, and the savings rate. Explain the returned figures using their asOf date, Budget periods, amounts and remaining days. Use only the returned figures and calculation bases; never invent missing values or calculate new recommendations. If an insight is null or absent, say it is unavailable. Creates and changes nothing.",
    input: getDashboardInputSchema,
    output: dashboardSummarySchema,
  }),
  readTool({
    name: "suggest_budget",
    description:
      "Proposes a Budget limit for one Category and cadence from the User's confirmed history, and shows the figures it is based on. It creates nothing.",
    input: budgetSuggestionInputSchema,
    output: budgetSuggestionSchema,
  }),
  readTool({
    name: "list_transactions",
    description: `Lists the User's transactions, newest first. Filter by month (YYYY-MM), kind (expense, income, or exclusion), or reviewStatus (pending or confirmed). Pending and exclusion records do not count towards totals. ${PAGING}`,
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
    name: "get_spending_forecast",
    description:
      "The User's latest spending forecast for the rest of this month: the payments they are expected to make (bills on a day of the month, habits on days of the week) with a confidence for each, plus the amount expected this week and this month. These are predictions, not records, so say they are expected. forecast is null when none has been made yet.",
    input: z.object({}).strict(),
    output: forecastResponseSchema,
  }),
  readTool({
    name: "refresh_spending_forecast",
    description:
      "Makes a fresh spending forecast from the User's confirmed expenses and returns it. Use it when the User asks for a new forecast or none exists. It never changes the User's records.",
    input: z.object({}).strict(),
    output: forecastResponseSchema,
  }),
  readTool({
    name: "list_reminders",
    description: `Lists the User's Reminders: budget threshold alerts and bills coming due. ${PAGING}`,
    input: listRemindersInputSchema,
    output: reminderPageSchema,
  }),
] satisfies AgentTool[];
