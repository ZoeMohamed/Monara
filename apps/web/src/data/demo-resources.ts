import {
  type Category,
  exclusionCategoryPresets,
  expenseCategoryPresets,
  type FinancialAccount,
  incomeCategoryPresets,
} from "@monara/contracts";
import type { Transaction } from "./demo-ledger.ts";
import { type Budget, demoMethods } from "./demo-ledger.ts";

const timestamp = "2026-10-01T00:00:00.000Z";

export function initialDemoAccounts(): FinancialAccount[] {
  return demoMethods.map((name, index) => ({
    id: `a0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name,
    institution: name === "Cash" ? null : name,
    accountType: name === "Cash" ? "cash" : name === "ShopeePay" ? "wallet" : "bank",
    currency: "IDR",
    lastFour: null,
    institutionKey: null,
    gmailConnectionId: null,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

// Demo categories use the same stable identity as the signed-in ledger.
export function demoEditorCategories(budgets: Budget[]): Category[] {
  const presets = [
    ...expenseCategoryPresets.map((preset) => ({ ...preset, kind: "expense" as const })),
    ...incomeCategoryPresets.map((preset) => ({ ...preset, kind: "income" as const })),
    ...exclusionCategoryPresets.map((preset) => ({ ...preset, kind: "exclusion" as const })),
  ];
  const extraNames = [...new Set(budgets.map((budget) => budget.category))].filter(
    (name) => !presets.some((preset) => preset.kind === "expense" && preset.name === name),
  );
  const choices = [
    ...presets,
    ...extraNames.map((name, index) => ({
      name,
      kind: "expense" as const,
      slug: `demo-category-${presets.length + index + 1}`,
      icon: "auto",
    })),
  ];
  return choices.map((preset, index) => ({
    id: `c0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name: preset.name,
    kind: preset.kind,
    slug: preset.slug,
    icon:
      (preset.kind === "expense"
        ? budgets.find((budget) => budget.category === preset.name)?.icon
        : undefined) ?? preset.icon,
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
    categoryId: category?.id ?? null,
    categoryIcon: category?.icon,
    categoryKind: category?.kind,
    method: payment?.name ?? null,
    financialAccountId: payment?.id ?? null,
  };
}
