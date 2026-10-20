import { type BrandEntry, brands } from "@monara/contracts";

export { brands };

export type BrandIdentity = keyof typeof brands;
/** A registered brand, or any Simple Icons slug the user picked from the logo search. */
export type BrandLogo = BrandIdentity | `si:${string}`;

export function brandLabelKey(value: string | null | undefined) {
  return (
    value
      ?.normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\s*·\s*/g, " · ")
      .toLowerCase() ?? ""
  );
}

const lookup = new Map<string, BrandIdentity>();
for (const [id, entry] of Object.entries(brands) as [BrandIdentity, BrandEntry][]) {
  for (const label of [entry.name, id.replaceAll("-", " "), ...(entry.aliases ?? [])])
    lookup.set(brandLabelKey(label), id);
}

// Exact known labels only. Free-form notes, category names and account nicknames
// cannot establish a merchant or a bank's identity.
export function merchantBrand(merchant: string | null | undefined) {
  return lookup.get(brandLabelKey(merchant));
}

export function institutionBrand(institution: string | null | undefined) {
  const brand = merchantBrand(institution);
  return brand && brands[brand].kind !== "merchant" ? brand : undefined;
}

export function brandForName(name: string | null | undefined) {
  return merchantBrand(name);
}

export function isBrandIdentity(value: string): value is BrandIdentity {
  return Object.hasOwn(brands, value);
}

const simpleSlug = /^[a-z0-9]{1,60}$/;

export function brandLogoFromChoice(choice: string | null | undefined): BrandLogo | undefined {
  if (!choice) return undefined;
  if (choice.startsWith("brand:")) {
    const id = choice.slice(6);
    return isBrandIdentity(id) ? id : undefined;
  }
  if (choice.startsWith("si:") && simpleSlug.test(choice.slice(3))) return choice as BrandLogo;
  return undefined;
}

/** The value stored for a chosen logo, e.g. on a category's icon field. */
export function brandLogoChoice(logo: BrandLogo): string {
  return logo.startsWith("si:") ? logo : `brand:${logo}`;
}

/** The catalog slug behind a logo, so search results can skip duplicates. */
export function brandLogoSlug(logo: BrandLogo): string | undefined {
  if (logo.startsWith("si:")) return logo.slice(3);
  const entry: BrandEntry = brands[logo as BrandIdentity];
  return entry.simple;
}

export function brandLogoSource(logo: BrandLogo): string {
  if (logo.startsWith("si:")) return `/brand-icons/${logo.slice(3)}.svg`;
  const entry: BrandEntry = brands[logo as BrandIdentity];
  return entry.asset ? `/brands/${entry.asset}` : `/brand-icons/${entry.simple}.svg`;
}

/** Registered brands whose name or alias contains the query, best matches first. */
export function searchBrands(
  query: string,
  kinds: readonly BrandEntry["kind"][] = ["bank", "wallet", "merchant"],
  limit = 12,
): BrandIdentity[] {
  const text = brandLabelKey(query);
  if (text.length === 0) return [];
  const wanted = new Set(kinds);
  const scored: { id: BrandIdentity; score: number }[] = [];
  for (const [id, entry] of Object.entries(brands) as [BrandIdentity, BrandEntry][]) {
    if (!wanted.has(entry.kind)) continue;
    const labels = [entry.name, ...(entry.aliases ?? [])].map(brandLabelKey);
    const score = labels.some((label) => label === text)
      ? 0
      : labels.some((label) => label.startsWith(text))
        ? 1
        : labels.some((label) => label.includes(text))
          ? 2
          : -1;
    if (score >= 0) scored.push({ id, score });
  }
  return scored
    .sort(
      (left, right) =>
        left.score - right.score || brands[left.id].name.localeCompare(brands[right.id].name),
    )
    .slice(0, limit)
    .map(({ id }) => id);
}

export function brandsOfKind(kinds: readonly BrandEntry["kind"][]): BrandIdentity[] {
  const wanted = new Set(kinds);
  return (Object.keys(brands) as BrandIdentity[]).filter((id) => wanted.has(brands[id].kind));
}

export type BrandKind = BrandEntry["kind"];
