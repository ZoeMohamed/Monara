// One palette for every category visual, so a slice, a ribbon and a list row always match.
const categoryStyles: Record<string, { color: string; emoji: string }> = {
  Digital: { color: "var(--accent)", emoji: "📱" },
  Transport: { color: "#1597b6", emoji: "🚕" },
  Shopping: { color: "#8870c9", emoji: "🛍️" },
  "Food & Drinks": { color: "#208577", emoji: "🍽️" },
  Other: { color: "#ba8736", emoji: "✦" },
  Uncategorized: { color: "var(--muted)", emoji: "❔" },
};
const extraColors = ["#d0577a", "#5b8def", "#2f9e6f", "#c77d2e"];

export function categoryColor(name: string, index = 0): string {
  return categoryStyles[name]?.color ?? extraColors[index % extraColors.length];
}

type CategoryGlyph =
  | "food"
  | "transport"
  | "shopping"
  | "digital"
  | "bills"
  | "home"
  | "heart"
  | "book"
  | "film"
  | "income"
  | "transfer"
  | "dot";

// Match whole category words: "Rent" gets a house, while "Current" stays neutral.
const categoryIcons: [RegExp, CategoryGlyph][] = [
  [/\b(rent|rental|housing|house|home|kos|mortgage|sewa)\b/i, "home"],
  [/\b(health|healthcare|medical|medicine|pharmacy|doctor|hospital|clinic)\b/i, "heart"],
  [/\b(education|school|courses?|tuition|books?)\b/i, "book"],
  [/\b(entertainment|movies?|cinema|games?|gaming|hobby|hobbies|leisure)\b/i, "film"],
  [/\b(food|drinks?|coffee|kopi|groceries|grocery|restaurants?|meals?|makan)\b/i, "food"],
  [/\b(transport|transportation|rides?|fuel|bensin|parking|tolls?|travel|ojek)\b/i, "transport"],
  [/\b(shopping|shops?|clothes|clothing|fashion|belanja)\b/i, "shopping"],
  [/\b(digital|subscriptions?|phone|internet|streaming)\b/i, "digital"],
  [/\b(bills?|utilities|utility|electric|electricity|listrik|water|insurance)\b/i, "bills"],
  [/\b(income|salary|gaji|wages?|payroll)\b/i, "income"],
  [/\b(transfers?)\b/i, "transfer"],
];

/** A drawn glyph per category meaning; anything unrecognised uses a neutral dot. */
export function categoryIcon(name: string): CategoryGlyph {
  return categoryIcons.find(([pattern]) => pattern.test(name))?.[1] ?? "dot";
}

export function categoryEmoji(name: string): string {
  return categoryStyles[name]?.emoji ?? "✦";
}
