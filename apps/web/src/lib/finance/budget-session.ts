import type { Budget, CreateBudgetInput, UpdateBudgetInput } from "@monara/contracts";
import type { BudgetDraft } from "./budget-draft.ts";

export type BudgetSaveRequest = {
  operation: "create_budget" | "edit_budget";
  input: CreateBudgetInput | UpdateBudgetInput;
  values: BudgetDraft;
  priorIds: Set<string>;
};

/** Sensitive drafts stay in app-session memory, including the original retry identity. */
export type BudgetDraftSession = {
  original?: Budget;
  initial: BudgetDraft;
  draft: BudgetDraft;
  request: BudgetSaveRequest | null;
  pending: boolean;
  uncertain: boolean;
  conflict: boolean;
  error: string | null;
};

export function budgetSessionKey(id?: string): string {
  return id ? `edit:${id}` : "create";
}
