import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentChatTurn, ReversibleActionReceipt } from "@monara/contracts";
import { runAgent } from "../src/conversation/agent.ts";
import type { AssistantMessage, ChatMessage, Complete } from "../src/conversation/llm.ts";
import { toToolDefinitions } from "../src/conversation/tools.ts";
import { writeTools } from "../src/conversation/write-tools.ts";

const userId = "7b0c0f0e-4f0f-4a4e-9f43-2f8e6f1c9a11";
const accountId = "5e5f6a6b-7c7d-4e8f-9a9b-0c0d1e1f2a2b";
const transactionId = "0d0f6f0a-1a1b-4c1d-8e1f-2a2b3c4d5e6f";

const receipt: ReversibleActionReceipt = {
  actionId: "9a9b0c0d-1e1f-4a2b-8c3d-4e5f6a7b8c9d",
  resourceType: "transaction",
  resourceId: transactionId,
  changedAt: "2026-10-13T10:00:00Z",
  undoExpiresAt: "2026-10-13T10:10:00Z",
};

const lunch = {
  id: transactionId,
  kind: "expense",
  merchantName: "Warteg Bahari",
  money: { amountMinor: "20000", currency: "IDR" },
  occurredOn: "2026-10-13",
  occurredTime: "17:00",
  description: null,
  location: null,
  accountHint: null,
  categoryId: null,
  financialAccountId: accountId,
  fromFinancialAccountId: null,
  toFinancialAccountId: null,
  reviewStatus: "confirmed",
  source: "in_app_chat",
  confidence: null,
  deletedAt: null,
  createdAt: "2026-10-13T10:00:00Z",
  updatedAt: "2026-10-13T10:00:00Z",
};

const callTool = (name: string, args: unknown): AssistantMessage => ({
  role: "assistant",
  content: null,
  tool_calls: [
    { id: "call_1", type: "function", function: { name, arguments: JSON.stringify(args) } },
  ],
});

/** Plays scripted model turns against the write tools and a fake backend. */
async function run(input: {
  turns: AssistantMessage[];
  backendResult?: unknown;
  history?: AgentChatTurn[];
}) {
  const operations: { operation: string; channel: string; userId: string; input: unknown }[] = [];
  const seen: ChatMessage[][] = [];
  const complete: Complete = async (messages) => {
    seen.push([...messages]);
    const next = input.turns[seen.length - 1];
    if (!next) throw new Error("The script ran out of turns.");
    return next;
  };
  const outcome = await runAgent({
    complete,
    tools: writeTools,
    caller: { userId, channel: "whatsapp" },
    history: input.history ?? [],
    text: "go",
    now: new Date("2026-10-13T10:00:00Z"),
    callOperation: async (operation, caller, operationInput) => {
      operations.push({
        operation,
        channel: caller.channel,
        userId: caller.userId,
        input: operationInput,
      });
      return input.backendResult;
    },
  });
  const result = seen
    .at(-1)
    ?.filter((message) => message.role === "tool")
    .at(-1);
  return {
    ...outcome,
    operations,
    seen,
    result: result?.role === "tool" ? JSON.parse(result.content) : undefined,
  };
}

const done: AssistantMessage = { role: "assistant", content: "Done." };

test("every write tool is T1 and has a schema the model can be given", () => {
  assert.ok(writeTools.every((tool) => tool.tier === "T1"));
  const definitions = toToolDefinitions(writeTools);
  assert.deepEqual(
    definitions.map((definition) => definition.function.name),
    [
      "add_transaction",
      "edit_transaction",
      "confirm_pending",
      "reject_pending",
      "create_budget",
      "edit_budget",
      "undo_action",
    ],
  );
  for (const definition of definitions) {
    assert.equal((definition.function.parameters as { type?: string }).type, "object");
  }
});

test("add_transaction fills what the User left out with null and returns the receipt", async () => {
  const outcome = await run({
    turns: [
      callTool("add_transaction", {
        kind: "expense",
        merchantName: "Warteg Bahari",
        money: { amountMinor: "20000", currency: "IDR" },
        occurredOn: "2026-10-13",
        financialAccountId: accountId,
      }),
      done,
    ],
    backendResult: { transaction: lunch, action: receipt },
  });

  assert.equal(outcome.operations.length, 1);
  const [operation] = outcome.operations;
  assert.equal(operation?.operation, "add_transaction");
  assert.equal(operation?.userId, userId);
  assert.equal(operation?.channel, "whatsapp");
  const { clientRequestId, ...values } = (operation?.input ?? {}) as Record<string, unknown>;
  assert.match(String(clientRequestId), /^[0-9a-f-]{36}$/);
  assert.deepEqual(values, {
    kind: "expense",
    merchantName: "Warteg Bahari",
    money: { amountMinor: "20000", currency: "IDR" },
    occurredOn: "2026-10-13",
    occurredTime: null,
    description: null,
    location: null,
    accountHint: null,
    categoryId: null,
    financialAccountId: accountId,
    fromFinancialAccountId: null,
    toFinancialAccountId: null,
  });
  assert.deepEqual(outcome.actions, [receipt]);
  assert.equal(outcome.reply, "Done.");
});

test("add_transaction without a Financial Account is not sent to the backend", async () => {
  const outcome = await run({
    turns: [
      callTool("add_transaction", {
        kind: "expense",
        merchantName: "Warteg Bahari",
        money: { amountMinor: "20000", currency: "IDR" },
        occurredOn: "2026-10-13",
      }),
      done,
    ],
  });

  assert.deepEqual(outcome.operations, []);
  assert.match(outcome.result.error, /Not recorded/);
  assert.match(outcome.result.error, /Financial Account/);
  assert.deepEqual(outcome.actions, []);
});

test("the model cannot supply its own request id or a negative amount", async () => {
  const outcome = await run({
    turns: [
      callTool("add_transaction", { clientRequestId: "replay-me", kind: "expense" }),
      callTool("add_transaction", {
        kind: "expense",
        merchantName: "Refund trick",
        money: { amountMinor: "-20000", currency: "IDR" },
        occurredOn: "2026-10-13",
        financialAccountId: accountId,
      }),
      done,
    ],
  });

  assert.deepEqual(outcome.operations, []);
  assert.match(outcome.result.error, /Invalid arguments/);
});

test("a failed write gives no receipt and tells the model only that it failed", async () => {
  const outcome = await run({
    turns: [
      callTool("edit_transaction", {
        transactionId,
        expectedUpdatedAt: "2026-10-13T10:00:00Z",
        changes: { money: { amountMinor: "38000", currency: "IDR" } },
      }),
      done,
    ],
    backendResult: { unexpected: "shape" },
  });

  assert.equal(outcome.operations.length, 1);
  assert.deepEqual(outcome.result, { error: "edit_transaction failed." });
  assert.deepEqual(outcome.actions, []);
});

test("earlier turns and their receipts reach the model, so undo can name the action", async () => {
  const outcome = await run({
    history: [
      { role: "user", text: "lunch 20k at Warteg Bahari from BCA" },
      { role: "assistant", text: "Saved: expense Rp 20.000.", actions: [receipt] },
    ],
    turns: [callTool("undo_action", { actionId: receipt.actionId }), done],
    backendResult: { anything: "the backend returns" },
  });

  const first = outcome.seen[0] ?? [];
  assert.deepEqual(
    first.map((message) => message.role),
    ["system", "user", "assistant", "system", "user"],
  );
  assert.match(String(first[3]?.content), new RegExp(receipt.actionId));
  assert.deepEqual(outcome.operations, [
    {
      operation: "undo_action",
      userId,
      channel: "whatsapp",
      input: { actionId: receipt.actionId },
    },
  ]);
  assert.deepEqual(outcome.result, { undone: true });
});
