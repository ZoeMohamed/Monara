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

/** At most one inserted, deleted or substituted character, never a transposition. */
function oneEditApart(left: string, right: string): boolean {
  const a = Array.from(left);
  const b = Array.from(right);
  if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  let first = 0;
  let second = 0;
  let edits = 0;
  while (first < a.length && second < b.length) {
    if (a[first] === b[second]) {
      first += 1;
      second += 1;
    } else {
      edits += 1;
      if (edits > 1) return false;
      if (a.length >= b.length) first += 1;
      if (b.length >= a.length) second += 1;
    }
  }
  return edits + Number(first < a.length || second < b.length) <= 1;
}

/**
 * Match exact normalized names, or complete subsets with two substantive words.
 * Flexible matching ignores word order and allows one character edit in at most
 * two words. Every distinct word in the shorter name must match a distinct word
 * in the longer name. Initials and a shared single word cannot establish a match.
 */
export function isHolderName(counterparty: string, holderName: string): boolean {
  const holder = nameWords(holderName);
  const other = nameWords(counterparty);
  if (
    holder.length > 0 &&
    holder.length === other.length &&
    holder.every((word, index) => word === other[index])
  )
    return true;

  const first = [...new Set(holder)];
  const second = [...new Set(other)];
  const [shorter, longer] = first.length <= second.length ? [first, second] : [second, first];
  const substantive = (word: string) => Array.from(word).length >= 3 && /\p{L}/u.test(word);
  if (shorter.length < 2 || shorter.filter(substantive).length < 2) return false;
  // Short words can match exactly as supporting evidence, never as fuzzy initials.
  if (shorter.some((word) => Array.from(word).length < 2)) return false;
  const candidates = shorter.map((word) =>
    longer
      .flatMap((candidate, index) =>
        word === candidate
          ? [{ index, cost: 0 }]
          : oneEditApart(word, candidate)
            ? [{ index, cost: 1 }]
            : [],
      )
      .sort((a, b) => a.cost - b.cost),
  );
  if (candidates.some((entries) => entries.length === 0)) return false;
  candidates.sort((a, b) => a.length - b.length);
  const used = new Set<number>();
  function match(index: number, typos: number): boolean {
    if (index === candidates.length) return true;
    for (const candidate of candidates[index] ?? []) {
      if (used.has(candidate.index) || typos + candidate.cost > 2) continue;
      used.add(candidate.index);
      if (match(index + 1, typos + candidate.cost)) return true;
      used.delete(candidate.index);
    }
    return false;
  }
  return match(0, 0);
}
