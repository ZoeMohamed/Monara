import type { Budget, Category } from "@monara/contracts";

export type BudgetDraft = {
  name: string;
  categoryId: string;
  cadence: "weekly" | "monthly";
  amount: string;
  startsOn: string;
  warningPercent: string;
  isActive: boolean;
};

export function budgetDraftOf(budget: Budget | undefined, today: string): BudgetDraft {
  return {
    name: budget?.name ?? "",
    categoryId: budget?.categoryId ?? "",
    cadence: budget?.cadence ?? "monthly",
    amount: budget?.limit.amountMinor ?? "",
    startsOn: budget?.startsOn ?? today,
    warningPercent: String(budget?.warningPercent ?? 80),
    isActive: budget?.isActive ?? true,
  };
}

/** Keep the fields the user edited while accepting untouched fields from the refreshed record. */
export function rebaseBudgetDraft(
  draft: BudgetDraft,
  initial: BudgetDraft,
  latest: BudgetDraft,
): BudgetDraft {
  return {
    name: draft.name === initial.name ? latest.name : draft.name,
    categoryId: draft.categoryId === initial.categoryId ? latest.categoryId : draft.categoryId,
    cadence: draft.cadence === initial.cadence ? latest.cadence : draft.cadence,
    amount: draft.amount === initial.amount ? latest.amount : draft.amount,
    startsOn: draft.startsOn === initial.startsOn ? latest.startsOn : draft.startsOn,
    warningPercent:
      draft.warningPercent === initial.warningPercent
        ? latest.warningPercent
        : draft.warningPercent,
    isActive: draft.isActive === initial.isActive ? latest.isActive : draft.isActive,
  };
}

export function budgetCategoryError(categories: Category[], categoryId: string): string | null {
  const category = categories.find((item) => item.id === categoryId);
  if (!category) return "Choose an available expense category.";
  if (category.isArchived) return "This category is archived. Choose another expense category.";
  if (category.kind !== "expense")
    return "Choose an expense category. Income and exclusions do not count toward budgets.";
  return null;
}
