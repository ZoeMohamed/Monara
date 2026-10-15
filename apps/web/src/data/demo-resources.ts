import type { Category, FinancialAccount } from "@monara/contracts";
import type { Transaction } from "./demo-ledger.ts";
import { type Budget, demoCategoryNames, demoMethods } from "./demo-ledger.ts";

const timestamp = "2026-10-01T00:00:00.000Z";

export function initialDemoAccounts(): FinancialAccount[] {
  return demoMethods.map((name, index) => ({
    id: `a0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name,
    institution: name === "Cash" ? null : name,
    accountType: name === "Cash" ? "cash" : name === "GoPay" ? "wallet" : "bank",
    currency: "IDR",
    lastFour: null,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

// Demo category IDs are editor choices only; the synthetic ledger groups by name.
export function demoEditorCategories(budgets: Budget[]): Category[] {
  const names = [...new Set([...demoCategoryNames, ...budgets.map((budget) => budget.category)])];
  return names.map((name, index) => ({
    id: `c0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    name,
    slug: `demo-category-${index + 1}`,
    icon: budgets.find((budget) => budget.category === name)?.icon ?? "auto",
    color: "#2865e5",
    isDefault: index < demoCategoryNames.length,
    isArchived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

export function demoTransferSelection(accounts: FinancialAccount[], method: string | null) {
  const matches = accounts.flatMap((from) =>
    accounts
      .filter((to) => to.id !== from.id && method === `${from.name} → ${to.name}`)
      .map((to) => ({ from: from.id, to: to.id })),
  );
  return matches.length === 1 ? matches[0] : { from: null, to: null };
}

export function demoTransactionSelection(
  draft: {
    kind: Transaction["kind"];
    method: string | null;
    category: string | null;
    fromAccount?: string | null;
    toAccount?: string | null;
  },
  resources: { financialAccounts: FinancialAccount[]; categories: Category[] },
) {
  const account = (id: string | null | undefined) =>
    resources.financialAccounts.find((item) => item.id === id);
  const from = account(draft.fromAccount);
  const to = account(draft.toAccount);
  const payment = account(draft.method);
  const category = resources.categories.find((item) => item.id === draft.category);
  return {
    category: category?.name ?? null,
    categoryIcon: category?.icon,
    method:
      draft.kind === "transfer"
        ? from && to
          ? `${from.name} → ${to.name}`
          : null
        : (payment?.name ?? null),
    financialAccountId: draft.kind === "transfer" ? null : (payment?.id ?? null),
    fromFinancialAccountId: draft.kind === "transfer" ? (from?.id ?? null) : null,
    toFinancialAccountId: draft.kind === "transfer" ? (to?.id ?? null) : null,
  };
}
