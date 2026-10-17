/** Words that are titles, not names, as Indonesian banks write them. */
const HONORIFICS = new Set([
  "bpk",
  "bapak",
  "ibu",
  "sdr",
  "sdri",
  "mr",
  "mrs",
  "ms",
  "tn",
  "ny",
  "nn",
]);

/** Lowercase name words without punctuation or titles. */
function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0 && !HONORIFICS.has(word));
}

/**
 * True when a payer or recipient name is the account holder's. It matches the same
 * name, a longer name containing every holder word, or a cut-off start of the holder
 * name of at least two words, as banks truncate names. A shared surname alone never
 * matches, so a transfer to a sibling stays an expense.
 */
export function isHolderName(counterparty: string, holderName: string): boolean {
  const holder = nameWords(holderName);
  const other = nameWords(counterparty);
  if (holder.length === 0 || other.length === 0) return false;
  // A one-word name says too little to match anything but itself.
  if (holder.length === 1) return other.length === 1 && other[0] === holder[0];
  if (holder.every((word) => other.includes(word))) return true;
  if (other.length < 2 || other.length > holder.length) return false;
  // Every word but the last must match in order; the last may be cut off mid-word.
  const last = other.length - 1;
  return other.every((word, index) =>
    index < last
      ? word === holder[index]
      : word === holder[index] || (word.length >= 3 && holder[index]?.startsWith(word) === true),
  );
}

/**
 * Turns an expense or income whose payer or recipient is the holder into an
 * exclusion: money moving between the holder's own accounts. Never the reverse.
 */
export function applyHolderRules<
  T extends { kind: string | null; counterpartyName: string | null },
>(items: readonly T[], holderName: string | null): T[] {
  if (!holderName) return [...items];
  return items.map((item) =>
    (item.kind === "expense" || item.kind === "income") &&
    item.counterpartyName !== null &&
    isHolderName(item.counterpartyName, holderName)
      ? { ...item, kind: "exclusion" }
      : item,
  );
}
