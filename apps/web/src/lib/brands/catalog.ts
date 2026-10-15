import * as simpleIcons from "simple-icons";

export type CatalogLogo = { slug: string; title: string; hex: string };

type SimpleIcon = CatalogLogo & { path: string };

// Simple Icons (CC0) is read on the server only, so the browser never downloads the
// whole catalog and logo lookups never leave this app for a third-party service.
const icons = new Map<string, SimpleIcon>();
for (const icon of Object.values(simpleIcons) as SimpleIcon[]) icons.set(icon.slug, icon);

function searchable(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function searchCatalog(query: string, limit = 24): CatalogLogo[] {
  const text = searchable(query);
  if (text.length === 0) return [];
  const ranked: { icon: SimpleIcon; score: number }[] = [];
  for (const icon of icons.values()) {
    const title = searchable(icon.title);
    const score =
      title === text || icon.slug === text
        ? 0
        : title.startsWith(text)
          ? 1
          : title.includes(text)
            ? 2
            : -1;
    if (score >= 0) ranked.push({ icon, score });
  }
  return ranked
    .sort(
      (left, right) => left.score - right.score || left.icon.title.localeCompare(right.icon.title),
    )
    .slice(0, limit)
    .map(({ icon }) => ({ slug: icon.slug, title: icon.title, hex: icon.hex }));
}

export function catalogSvg(slug: string): string | null {
  const icon = icons.get(slug);
  if (!icon) return null;
  // Path data and hex come from the bundled package, never from the request.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#${icon.hex}"><title>${icon.title.replace(/[<&>]/g, "")}</title><path d="${icon.path}"/></svg>`;
}
