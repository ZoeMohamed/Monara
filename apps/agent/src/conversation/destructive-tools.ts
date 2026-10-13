import {
  deleteBudgetInputSchema,
  deleteRecurringBillInputSchema,
  deleteTransactionInputSchema,
} from "@monara/contracts";
import type { AgentTool } from "./tools.ts";

const CONFIRMED_LATER =
  "This does not delete anything yet: it asks the User to confirm. Take expectedUpdatedAt from the record's updatedAt as you last read it.";

// bulk_edit is in the PRD but has no input contract yet, so it is not offered.
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
  {
    name: "delete_bill",
    description: `Asks to delete one recurring bill. ${CONFIRMED_LATER}`,
    tier: "T2",
    input: deleteRecurringBillInputSchema,
  },
] satisfies AgentTool[];
