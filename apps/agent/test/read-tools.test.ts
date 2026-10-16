import assert from "node:assert/strict";
import { test } from "node:test";
import type { DashboardSummary } from "@monara/contracts";
import { runAgent } from "../src/conversation/agent.ts";
import { createCallOperation } from "../src/conversation/backend.ts";
import type { AssistantMessage, ChatMessage, Complete } from "../src/conversation/llm.ts";
import { readTools } from "../src/conversation/read-tools.ts";
import { toToolDefinitions } from "../src/conversation/tools.ts";

const userId = "7b0c0f0e-4f0f-4a4e-9f43-2f8e6f1c9a11";
const now = new Date("2026-10-13T18:30:00Z");

const coffee = {
  id: "0d0f6f0a-1a1b-4c1d-8e1f-2a2b3c4d5e6f",
  kind: "expense",
  merchantName: "Kopi Kenangan",
  money: { amountMinor: "25000", currency: "IDR" },
  occurredOn: "2026-10-12",
  occurredTime: null,
  description: null,
  location: null,
  accountHint: null,
  categoryId: null,
  financialAccountId: "5e5f6a6b-7c7d-4e8f-9a9b-0c0d1e1f2a2b",
  fromFinancialAccountId: null,
  toFinancialAccountId: null,
  reviewStatus: "confirmed",
  source: "manual_form",
  confidence: null,
  deletedAt: null,
  createdAt: "2026-10-12T03:00:00Z",
  updatedAt: "2026-10-12T03:00:00Z",
};

const callTool = (name: string, args: unknown): AssistantMessage => ({
  role: "assistant",
  content: null,
  tool_calls: [
    { id: "call_1", type: "function", function: { name, arguments: JSON.stringify(args) } },
  ],
});

/** Asks for one tool call, then replies, and returns what the tool gave the model. */
async function runTool(
  name: string,
  args: unknown,
  backendResult: unknown,
  backendFailure?: Error,
) {
  const operations: { operation: string; userId: string; input: unknown }[] = [];
  const seen: ChatMessage[][] = [];
  const turns = [callTool(name, args), { role: "assistant", content: "Done." } as const];
  const complete: Complete = async (messages) => {
    seen.push([...messages]);
    const next = turns[seen.length - 1];
    if (!next) throw new Error("The script ran out of turns.");
    return next;
  };
  const response = await runAgent({
    complete,
    tools: readTools,
    caller: { userId, channel: "web" },
    history: [],
    text: "go",
    now,
    callOperation: async (operation, caller, input) => {
      operations.push({ operation, userId: caller.userId, input });
      if (backendFailure) throw backendFailure;
      return backendResult;
    },
  });
  const result = seen[1]?.filter((message) => message.role === "tool").at(-1);
  return {
    actions: response.actions,
    confirmation: response.confirmation,
    operations,
    system: String(seen[0]?.[0]?.content),
    result: result?.role === "tool" ? JSON.parse(result.content) : undefined,
  };
}

test("every read tool is T0 and has a schema the model can be given", () => {
  assert.ok(readTools.every((tool) => tool.tier === "T0"));
  const definitions = toToolDefinitions(readTools);
  assert.deepEqual(
    definitions.map((definition) => definition.function.name),
    [
      "get_summary",
      "get_dashboard",
      "suggest_budget",
      "list_transactions",
      "list_financial_accounts",
      "list_categories",
      "list_budgets",
      "list_reminders",
    ],
  );
  for (const definition of definitions) {
    assert.equal((definition.function.parameters as { type?: string }).type, "object");
  }
});

const money = (amountMinor: string) => ({ amountMinor, currency: "IDR" as const });
const foodCategoryId = "c0c0c0c0-0000-4000-8000-000000000001";
const foodBudgetId = "c0c0c0c0-0000-4000-8000-000000000002";
const dashboard = {
  month: "2026-10",
  income: money("10000000"),
  spending: money("4000000"),
  difference: money("6000000"),
  remainingBudget: money("2000000"),
  pace: {
    asOf: "2026-10-14",
    elapsedDays: 14,
    daysInMonth: 31,
    averageDailySpending: money("285714"),
    projectedSpending: money("8857134"),
  },
  categoryBreakdown: [
    {
      categoryId: foodCategoryId,
      categoryName: "Food",
      total: money("4000000"),
      sharePercent: 100,
    },
  ],
  budgetUsage: [],
  insights: {
    asOf: "2026-10-14",
    savingsRate: {
      income: money("10000000"),
      spending: money("4000000"),
      difference: money("6000000"),
      ratePercent: 60,
    },
    safeToSpend: {
      overall: {
        limit: money("6000000"),
        spending: money("4000000"),
        remaining: money("2000000"),
        shortfall: money("0"),
        remainingDays: 18,
        dailyAmount: money("111111"),
      },
      byCategory: [
        {
          budgetId: foodBudgetId,
          categoryId: foodCategoryId,
          categoryName: "Food",
          periodStartsOn: "2026-10-01",
          periodEndsOn: "2026-10-31",
          limit: money("6000000"),
          spending: money("4000000"),
          remaining: money("2000000"),
          shortfall: money("0"),
          remainingDays: 18,
          dailyAmount: money("111111"),
        },
      ],
    },
    overspendForecasts: [
      {
        budgetId: foodBudgetId,
        categoryId: foodCategoryId,
        categoryName: "Food",
        periodStartsOn: "2026-10-01",
        periodEndsOn: "2026-10-31",
        elapsedDays: 14,
        periodDays: 31,
        limit: money("6000000"),
        spending: money("4000000"),
        projectedSpending: money("8857143"),
        projectedOverspend: money("2857143"),
      },
    ],
    unusualTransactions: [
      {
        transactionId: coffee.id,
        categoryId: foodCategoryId,
        categoryName: "Food",
        amount: money("25000"),
        historyMedian: money("10000"),
        historyTransactionCount: 5,
        multipleOfMedian: 2.5,
      },
    ],
  },
  recentTransactions: [],
  activeReminders: [],
} satisfies DashboardSummary;

test("get_dashboard returns exact backend insight figures and bases without changing records", async () => {
  const run = await runTool("get_dashboard", { month: "2026-10" }, dashboard);

  assert.deepEqual(run.operations, [
    { operation: "get_dashboard", userId, input: { month: "2026-10" } },
  ]);
  assert.deepEqual(run.result, dashboard);
  assert.deepEqual(run.actions, []);
  assert.equal(run.confirmation, null);
});

test("get_dashboard preserves unavailable insights instead of fabricating recommendations", async () => {
  const empty = {
    ...dashboard,
    insights: {
      ...dashboard.insights,
      savingsRate: { ...dashboard.insights.savingsRate, ratePercent: null },
      safeToSpend: { overall: null, byCategory: [] },
      overspendForecasts: [],
      unusualTransactions: [],
    },
  };
  const run = await runTool("get_dashboard", { month: "2026-10" }, empty);

  assert.deepEqual(run.result, empty);
  assert.deepEqual(run.actions, []);
});

test("get_dashboard rejects invalid months and caller identity in model input before reading", async () => {
  for (const input of [
    { month: "2026-13" },
    { month: "2026-10", userId: "11111111-1111-4111-8111-111111111111" },
  ]) {
    const run = await runTool("get_dashboard", input, dashboard);
    assert.deepEqual(run.operations, []);
    assert.match(run.result.error, /Invalid arguments/);
    assert.deepEqual(run.actions, []);
  }
});

test("get_dashboard withholds malformed insight values and private backend fields", async () => {
  for (const result of [
    {
      ...dashboard,
      insights: {
        ...dashboard.insights,
        safeToSpend: {
          ...dashboard.insights.safeToSpend,
          overall: { ...dashboard.insights.safeToSpend.overall, dailyAmount: money("-1") },
        },
      },
    },
    {
      ...dashboard,
      insights: {
        ...dashboard.insights,
        unusualTransactions: [
          { ...dashboard.insights.unusualTransactions[0], rawEmail: "Private email content" },
        ],
      },
    },
    { ...dashboard, insights: undefined },
  ]) {
    const run = await runTool("get_dashboard", { month: "2026-10" }, result);
    assert.deepEqual(run.result, { error: "get_dashboard failed." });
    assert.deepEqual(run.actions, []);
    assert.equal(run.confirmation, null);
  }
});

test("get_dashboard hides backend failure details and never substitutes invented figures", async () => {
  const run = await runTool(
    "get_dashboard",
    { month: "2026-10" },
    dashboard,
    new Error("Private financial record from the backend"),
  );

  assert.deepEqual(run.operations, [
    { operation: "get_dashboard", userId, input: { month: "2026-10" } },
  ]);
  assert.deepEqual(run.result, { error: "get_dashboard failed." });
  assert.deepEqual(run.actions, []);
  assert.equal(run.confirmation, null);
});

test("a read tool calls its operation for the verified User and returns the page", async () => {
  const page = { items: [coffee], nextCursor: null };
  const run = await runTool("list_transactions", { month: "2026-10", kind: "expense" }, page);

  assert.deepEqual(run.operations, [
    {
      operation: "list_transactions",
      userId,
      input: { month: "2026-10", kind: "expense", limit: 50 },
    },
  ]);
  assert.deepEqual(run.result, page);
});

test("the model cannot choose which User a read tool acts for", async () => {
  const run = await runTool(
    "list_transactions",
    { userId: "11111111-1111-4111-8111-111111111111" },
    { items: [], nextCursor: null },
  );

  assert.deepEqual(run.operations, []);
  assert.match(run.result.error, /Invalid arguments/);
});

test("a backend result outside the contract is not shown to the model", async () => {
  const page = {
    items: [{ ...coffee, rawEmail: "Dear customer, your OTP is 123456" }],
    nextCursor: null,
  };
  const run = await runTool("list_transactions", {}, page);

  assert.deepEqual(run.result, { error: "list_transactions failed." });
});

test("the prompt gives the model the date and time in Jakarta", async () => {
  const run = await runTool("list_budgets", {}, { items: [], nextCursor: null });

  // 18:30 UTC on 13 October is already 14 October in Jakarta.
  assert.match(run.system, /It is now 2026-10-14 01:30 for the User\./);
});

test("the backend caller authenticates, sends the User and Channel, and hides error bodies", async (t) => {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  let response = Response.json({ items: [], nextCursor: null });
  t.mock.method(globalThis, "fetch", async (url: string, init?: RequestInit) => {
    requests.push({ url, init });
    return response;
  });
  const callOperation = createCallOperation({ baseUrl: "https://monara.test/", secret: "s3cret" });

  assert.deepEqual(
    await callOperation("list_budgets", { userId, channel: "whatsapp" }, { limit: 50 }),
    {
      items: [],
      nextCursor: null,
    },
  );
  assert.equal(requests[0]?.url, "https://monara.test/api/agent/operations/list_budgets");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(new Headers(requests[0]?.init?.headers).get("Authorization"), "Bearer s3cret");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    userId,
    channel: "whatsapp",
    input: { limit: 50 },
  });

  response = Response.json({ message: "salary Rp 9.000.000" }, { status: 500 });
  await assert.rejects(
    callOperation("list_budgets", { userId, channel: "web" }, {}),
    (error: Error) => {
      assert.equal(error.message, "list_budgets failed with status 500.");
      return true;
    },
  );
});

test("get_summary adds every page up exactly and leaves transfers out", async () => {
  const row = (kind: string, amountMinor: string, categoryId: string | null) => ({
    ...coffee,
    kind,
    categoryId,
    money: { amountMinor, currency: "IDR" },
    ...(kind === "transfer"
      ? {
          financialAccountId: null,
          fromFinancialAccountId: "5e5f6a6b-7c7d-4e8f-9a9b-0c0d1e1f2a2b",
          toFinancialAccountId: "5e5f6a6b-7c7d-4e8f-9a9b-0c0d1e1f2a2c",
        }
      : {}),
  });
  const food = "c0c0c0c0-0000-4000-8000-000000000001";
  const pages: Record<string, unknown> = {
    "2026-09|": { items: [row("expense", "900000", food)], nextCursor: null },
    "2026-10|": {
      items: [row("income", "9000000000000000", null), row("expense", "25000", food)],
      nextCursor: "next",
    },
    "2026-10|next": {
      items: [row("expense", "48500", null), row("transfer", "500000", null)],
      nextCursor: null,
    },
  };
  const inputs: unknown[] = [];
  const done: AssistantMessage = { role: "assistant", content: "Done." };
  const turns = [callTool("get_summary", { months: ["2026-10", "2026-09", "2026-10"] }), done];
  const seen: ChatMessage[][] = [];
  await runAgent({
    complete: async (messages) => {
      seen.push([...messages]);
      return turns[seen.length - 1] ?? done;
    },
    tools: readTools,
    caller: { userId, channel: "web" },
    history: [],
    text: "go",
    now,
    callOperation: async (_operation, _caller, input) => {
      inputs.push(input);
      const { month, cursor } = input as { month: string; cursor: string | null };
      return pages[`${month}|${cursor ?? ""}`];
    },
  });
  const result = seen[1]?.filter((message) => message.role === "tool").at(-1);

  assert.deepEqual(inputs[0], {
    month: "2026-09",
    reviewStatus: "confirmed",
    limit: 100,
    cursor: null,
  });
  assert.equal(inputs.length, 3);
  assert.deepEqual(JSON.parse(String(result?.content)), {
    months: [
      {
        month: "2026-09",
        income: { amountMinor: "0", currency: "IDR" },
        spending: { amountMinor: "900000", currency: "IDR" },
        difference: { amountMinor: "-900000", currency: "IDR" },
        savingsRatePercent: null,
        transactionCount: 1,
        spendingByCategory: [
          { categoryId: food, total: { amountMinor: "900000", currency: "IDR" } },
        ],
      },
      {
        month: "2026-10",
        income: { amountMinor: "9000000000000000", currency: "IDR" },
        spending: { amountMinor: "73500", currency: "IDR" },
        difference: { amountMinor: "8999999999926500", currency: "IDR" },
        savingsRatePercent: 99.9,
        transactionCount: 3,
        spendingByCategory: [
          { categoryId: null, total: { amountMinor: "48500", currency: "IDR" } },
          { categoryId: food, total: { amountMinor: "25000", currency: "IDR" } },
        ],
      },
    ],
    allMonths: {
      income: { amountMinor: "9000000000000000", currency: "IDR" },
      spending: { amountMinor: "973500", currency: "IDR" },
      difference: { amountMinor: "8999999999026500", currency: "IDR" },
      averageMonthlySpending: { amountMinor: "486750", currency: "IDR" },
    },
  });
});
