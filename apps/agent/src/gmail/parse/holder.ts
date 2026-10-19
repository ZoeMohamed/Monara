/** Titles used by Indonesian banks, which are not part of a holder's name. */
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

function nameWords(name: string): string[] {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0 && !HONORIFICS.has(word));
}

/** Exact full-name match after case, punctuation, spacing and title normalization. */
export function isHolderName(counterparty: string, holderName: string): boolean {
  const holder = nameWords(holderName);
  const other = nameWords(counterparty);
  return (
    holder.length > 0 &&
    holder.length === other.length &&
    holder.every((word, index) => word === other[index])
  );
}

/** A name alone never establishes a transfer between the User's own accounts. */
export function applyHolderRules<
  T extends {
    kind: string | null;
    counterpartyName: string | null;
    flowDirection?: "in" | "out" | null;
    isTransfer?: boolean;
    internalTransfer?: boolean;
    counterpartyType?: "business" | "person" | "unknown";
  },
>(items: readonly T[], holderName: string | null): T[] {
  return items.map((item) => {
    const internalTransfer = Boolean(
      holderName &&
        item.isTransfer &&
        item.counterpartyType !== "business" &&
        item.counterpartyName &&
        isHolderName(item.counterpartyName, holderName),
    );
    return {
      ...item,
      internalTransfer,
      ...(internalTransfer
        ? {
            kind: "exclusion",
            flowDirection:
              item.kind === "expense" ? "out" : item.kind === "income" ? "in" : item.flowDirection,
          }
        : {}),
    };
  });
}
