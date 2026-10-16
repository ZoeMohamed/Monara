import { deleteBudgetInputSchema, deleteTransactionInputSchema } from "@monara/contracts";
import type { AgentTool } from "./tools.ts";

const CONFIRMED_LATER =
  "This does not delete anything yet: it asks the User to confirm. Take expectedUpdatedAt from the record's updatedAt as you last read it.";

// bulk_edit is in the PRD but has no input contract yet, and recurring bills have no
// backend operations yet, so neither is offered.
export const destructiveTools = [
  {
    name: "delete_transaction",
    description: `Asks to delete one transaction. ${CONFIRMED_LATER}`,
    tier: "T2",
    input: deleteTransactionInputSchema,
  },
  {
    name: "delete_budget",
    description: `Asks to delete one Budget. ${CONFIRMED_LATER}`,
    tier: "T2",
    input: deleteBudgetInputSchema,
  },
] satisfies AgentTool[];
