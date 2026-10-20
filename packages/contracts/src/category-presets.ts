import { z } from "zod";

// Preserve shipped category identities when extending the default catalog.
export const expenseCategoryPresets = [
  { slug: "housing", name: "Housing", group: "Home", icon: "home" },
  { slug: "bills", name: "Bills", group: "Home", icon: "bills" },
  { slug: "services", name: "Services", group: "Home", icon: "services" },
  { slug: "resto-cafe", name: "Resto & Cafe", group: "Food", icon: "food" },
  { slug: "groceries", name: "Groceries", group: "Food", icon: "groceries" },
  { slug: "ride-hail", name: "Ride-hail", group: "Transport", icon: "transport" },
  { slug: "own-vehicle", name: "Own Vehicle", group: "Transport", icon: "transport" },
  { slug: "ecommerce", name: "Ecommerce", group: "Shopping", icon: "shopping" },
  { slug: "retail", name: "Retail", group: "Shopping", icon: "store" },
  { slug: "digital", name: "Digital", group: "Lifestyle", icon: "digital" },
  { slug: "travel", name: "Travel", group: "Lifestyle", icon: "travel" },
  { slug: "activities", name: "Activities", group: "Lifestyle", icon: "film" },
  { slug: "bar-drinks", name: "Bar & Drinks", group: "Lifestyle", icon: "drinks" },
  { slug: "insurance", name: "Insurance", group: "Health", icon: "shield" },
  { slug: "clinic-meds", name: "Clinic & Meds", group: "Health", icon: "heart" },
  { slug: "fit-wellness", name: "Fit & Wellness", group: "Health", icon: "pulse" },
  { slug: "family", name: "Family", group: "Family", icon: "family" },
  { slug: "giving", name: "Giving", group: "Others", icon: "giving" },
  { slug: "person", name: "Person", group: "Others", icon: "family" },
  { slug: "misc", name: "Misc", group: "Others", icon: "dot" },
] as const;

export const incomeCategoryPresets = [
  { slug: "salary", name: "Salary", icon: "income" },
  { slug: "freelance", name: "Freelance", icon: "income" },
  { slug: "business", name: "Business", icon: "store" },
  { slug: "interest", name: "Interest", icon: "income" },
  { slug: "gifts", name: "Gifts", icon: "giving" },
  { slug: "other-income", name: "Other Income", icon: "income" },
  { slug: "person-income", name: "Person", icon: "family" },
  { slug: "misc-income", name: "Misc", icon: "dot" },
] as const;

export const exclusionCategoryPresets = [
  { slug: "repayment", name: "Repayment", icon: "repayment", automated: false },
  { slug: "internal", name: "Internal", icon: "internal", automated: true },
  { slug: "reimbursed", name: "Reimbursed", icon: "reimbursed", automated: false },
  { slug: "investment", name: "Investment", icon: "investment", automated: false },
  { slug: "one-off", name: "One-off", icon: "one-off", automated: false },
  { slug: "cancelled", name: "Cancelled", icon: "cancelled", automated: false },
  { slug: "misc-exclusion", name: "Misc", icon: "dot", automated: true },
] as const;

export const exclusionCategorySchema = z.enum([
  "repayment",
  "internal",
  "reimbursed",
  "investment",
  "one-off",
  "cancelled",
  "misc-exclusion",
]);
export type ExclusionCategory = z.infer<typeof exclusionCategorySchema>;

/** Legacy label lookup. Shared labels cannot establish an exclusion type. */
export function isExclusionCategoryName(name: string | null | undefined): boolean {
  const normalized = name?.trim().toLowerCase();
  return (
    ![...expenseCategoryPresets, ...incomeCategoryPresets].some(
      (category) => category.name.toLowerCase() === normalized,
    ) && exclusionCategoryPresets.some((category) => category.name.toLowerCase() === normalized)
  );
}
