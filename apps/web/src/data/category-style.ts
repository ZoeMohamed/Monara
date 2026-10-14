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

const categoryIcons: Record<string, "food" | "transport" | "shopping" | "digital" | "bills"> = {
  "Food & Drinks": "food",
  Transport: "transport",
  Shopping: "shopping",
  Digital: "digital",
  Bills: "bills",
};

/** A drawn glyph per known category; anything else uses a neutral dot. */
export function categoryIcon(
  name: string,
): "food" | "transport" | "shopping" | "digital" | "bills" | "dot" {
  return categoryIcons[name] ?? "dot";
}

export function categoryEmoji(name: string): string {
  return categoryStyles[name]?.emoji ?? "✦";
}
