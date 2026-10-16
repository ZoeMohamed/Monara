import {
  budgetMutationResultSchema,
  confirmTransactionInputSchema,
  createBudgetInputSchema,
  createTransactionInputSchema,
  rejectTransactionInputSchema,
  transactionMutationResultSchema,
  transactionValuesSchema,
  undoActionInputSchema,
  updateBudgetInputSchema,
  updateTransactionInputSchema,
} from "@monara/contracts";
import { z } from "zod";
import type { AgentTool } from "./tools.ts";

/**
 * A T1 tool that forwards to one backend mutation. Every mutation result
 * carries a reversible action receipt, which the Agent uses to offer undo.
 */
function writeTool<Input extends z.ZodType>(config: {
  name: string;
  description: string;
  input: Input;
  output: z.ZodType;
}): AgentTool<Input> {
  return {
    name: config.name,
    description: config.description,
    tier: "T1",
    input: config.input,
    async run(input, context) {
      return config.output.parse(await context.callOperation(config.name, context, input));
    },
  };
}

const STALE =
  "Take expectedUpdatedAt from the record's updatedAt as you last read it; if the tool fails, read the record again before another attempt.";

const UNSET_TRANSACTION_VALUES = Object.fromEntries(
  Object.keys(transactionValuesSchema.shape).map((key) => [key, null]),
);

// The model names only what the User said. Everything else stays null instead
// of being guessed, and the shared contract decides whether that is enough.
const addTransactionInputSchema = transactionValuesSchema.partial().strict();

const addTransaction: AgentTool<typeof addTransactionInputSchema> = {
  name: "add_transaction",
  description:
    "Records a confirmed transaction. Needs kind, money, occurredOn, a merchantName or description, and a Financial Account: financialAccountId for an expense or income, fromFinancialAccountId and toFinancialAccountId for a transfer. A transfer needs a description too: use the words the User used. Leave out anything the User did not give.",
  tier: "T1",
  input: addTransactionInputSchema,
  async run(input, context) {
    const request = createTransactionInputSchema.safeParse({
      ...UNSET_TRANSACTION_VALUES,
      ...input,
      // Minted here, not by the model, so a backend retry cannot record it twice.
      clientRequestId: crypto.randomUUID(),
    });
    if (!request.success) return { error: `Not recorded: ${z.prettifyError(request.error)}` };
    return transactionMutationResultSchema.parse(
      await context.callOperation("add_transaction", context, request.data),
    );
  },
};

const createBudgetToolInputSchema = createBudgetInputSchema.omit({ clientRequestId: true });

const createBudget: AgentTool<typeof createBudgetToolInputSchema> = {
  name: "create_budget",
  description:
    "Creates a Budget for one Category with a limit, a cadence (weekly or monthly), and the date it starts. warningPercent is when the User is warned and defaults to 80.",
  tier: "T1",
  input: createBudgetToolInputSchema,
  async run(input, context) {
    return budgetMutationResultSchema.parse(
      await context.callOperation("create_budget", context, {
        ...input,
        clientRequestId: crypto.randomUUID(),
      }),
    );
  },
};

const undoAction: AgentTool<typeof undoActionInputSchema> = {
  name: "undo_action",
  description:
    "Reverses one earlier change, given the actionId from its receipt. Receipts expire at undoExpiresAt.",
  tier: "T1",
  input: undoActionInputSchema,
  async run(input, context) {
    // The contracts define no result for an undo, so the model only learns that it worked.
    await context.callOperation("undo_action", context, input);
    return { undone: true };
  },
};

export const writeTools = [
  addTransaction,
  writeTool({
    name: "edit_transaction",
    description: `Changes fields of a confirmed transaction. Send only the fields that change. ${STALE}`,
    input: updateTransactionInputSchema,
    output: transactionMutationResultSchema,
  }),
  writeTool({
    name: "confirm_pending",
    description: `Confirms a pending transaction from the Review Queue. values is the full record to save: copy the pending transaction's fields and apply any changes the User asked for. ${STALE}`,
    input: confirmTransactionInputSchema,
    output: transactionMutationResultSchema,
  }),
  writeTool({
    name: "reject_pending",
    description: `Rejects a pending transaction from the Review Queue so it never counts. ${STALE}`,
    input: rejectTransactionInputSchema,
    output: transactionMutationResultSchema,
  }),
  createBudget,
  writeTool({
    name: "edit_budget",
    description: `Changes a Budget's limit, cadence, warning level, or whether it is active. Send only the fields that change. ${STALE}`,
    input: updateBudgetInputSchema,
    output: budgetMutationResultSchema,
  }),
  undoAction,
] satisfies AgentTool[];
