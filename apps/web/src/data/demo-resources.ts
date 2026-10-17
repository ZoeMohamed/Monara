import {
  type Category,
  exclusionCategoryPresets,
  expenseCategoryPresets,
  type FinancialAccount,
} from "@monara/contracts";
import type { Transaction } from "./demo-ledger.ts";
import { type Budget, demoMethods } from "./demo-ledger.ts";

const timestamp = "2026-10-01T00:00:00.000Z";

export function initialDemoAccounts(): FinancialAccount[] {
  return demoMethods.map((name, index) => ({
    id: `a0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name,
    institution: name === "Cash" ? null : name,
    accountType: name === "Cash" ? "cash" : name === "GoPay" ? "wallet" : "bank",
    currency: "IDR",
    lastFour: null,
    institutionKey: null,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

// Demo category IDs are editor choices only; the synthetic ledger groups by name.
export function demoEditorCategories(budgets: Budget[]): Category[] {
  const presets = [...expenseCategoryPresets, ...exclusionCategoryPresets];
  const names = [
    ...new Set([
      ...presets.map((preset) => preset.name),
      ...budgets.map((budget) => budget.category),
    ]),
  ];
  return names.map((name, index) => ({
    id: `c0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name,
    slug: presets.find((preset) => preset.name === name)?.slug ?? `demo-category-${index + 1}`,
    icon:
      budgets.find((budget) => budget.category === name)?.icon ??
      presets.find((preset) => preset.name === name)?.icon ??
      "auto",
    color: "#2865e5",
    isDefault: index < presets.length,
    isArchived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

export function demoTransactionSelection(
  draft: {
    kind: Transaction["kind"];
    method: string | null;
    category: string | null;
  },
  resources: { financialAccounts: FinancialAccount[]; categories: Category[] },
) {
  const account = (id: string | null | undefined) =>
    resources.financialAccounts.find((item) => item.id === id);
  const payment = account(draft.method);
  const category = resources.categories.find((item) => item.id === draft.category);
  return {
    category: category?.name ?? null,
    categoryIcon: category?.icon,
    method: payment?.name ?? null,
    financialAccountId: payment?.id ?? null,
  };
}
