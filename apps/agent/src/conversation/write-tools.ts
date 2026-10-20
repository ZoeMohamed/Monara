import {
  budgetMutationResultSchema,
  confirmTransactionInputSchema,
  createBudgetInputSchema,
  createTransactionInputSchema,
  excludeTransactionInputSchema,
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
    "Records an expense, income, or exclusion. Money uses whole rupiah for IDR and cents for USD, so US$19.99 is amountMinor 1999 with currency USD. A missing USD conversion returns a saved pending transaction excluded from totals; inspect reviewStatus and idrMoney before describing the result. Exclusions track reimbursements, internal transfers, duplicates, and non-personal activity without affecting totals. Needs kind, money, occurredOn, a merchantName or description, and one Financial Account/payment method in financialAccountId. Leave out anything the User did not give.",
  tier: "T1",
  input: addTransactionInputSchema,
  async run(input, context) {
    const request = createTransactionInputSchema.safeParse({
      ...UNSET_TRANSACTION_VALUES,
      ...input,
      flowDirection:
        input.kind === "expense"
          ? "out"
          : input.kind === "income"
            ? "in"
            : (input.flowDirection ?? null),
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
    name: "exclude_pending",
    description: `Excludes a pending transaction from the Review Queue so it stays in the import audit trail but never counts. Use this for reimbursements, internal transfers, duplicates, or non-personal activity. ${STALE}`,
    input: excludeTransactionInputSchema,
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
