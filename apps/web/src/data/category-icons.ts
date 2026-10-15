import {
  type BrandLogo,
  brandForName,
  brandLogoChoice,
  brandLogoFromChoice,
} from "./brand-identity.ts";
import { categoryIcon } from "./category-style.ts";

export const categoryIconChoices = [
  { id: "food", name: "Food" },
  { id: "transport", name: "Transport" },
  { id: "shopping", name: "Shopping" },
  { id: "digital", name: "Digital" },
  { id: "home", name: "Home" },
  { id: "heart", name: "Health" },
  { id: "book", name: "Education" },
  { id: "film", name: "Entertainment" },
  { id: "bills", name: "Bills" },
  { id: "income", name: "Income" },
  { id: "transfer", name: "Transfer" },
  { id: "dot", name: "Other" },
] as const;

/** Stored category symbols never infer provider or financial account identity. */
export function chosenCategoryIcon(
  name: string,
  choice?: string | null,
): ReturnType<typeof categoryIcon> {
  return categoryIconChoices.find((icon) => icon.id === choice)?.id ?? categoryIcon(name);
}

/**
 * A category named exactly after a known brand shows its logo until the user picks
 * something else; an explicitly chosen symbol always wins.
 */
export function chosenCategoryLogo(name: string, choice?: string | null): BrandLogo | undefined {
  if (!choice || choice === "auto") return brandForName(name);
  return brandLogoFromChoice(choice);
}

/** The icon value saved with a category: a brand logo reference or a symbol id. */
export function categoryIconChoice(name: string, choice?: string | null): string {
  const logo = chosenCategoryLogo(name, choice);
  return logo ? brandLogoChoice(logo) : chosenCategoryIcon(name, choice);
}
