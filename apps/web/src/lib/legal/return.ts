/** Pages a legal page may send the User back to: Profile, and its demo twin. */
const returnPaths = ["/profile", "/demo/profile"] as const;

/** Where Back goes when the page was not opened from Profile, such as a direct visit. */
const fallbackPath = "/";

/** The query value is browser input, so only the known Profile pages are ever followed. */
export function legalReturnPath(value: string | string[] | undefined): string {
  return returnPaths.find((path) => path === value) ?? fallbackPath;
}

/** The legal page link for a screen to place in its own page, so Back returns to it. */
export function legalHref(page: "terms" | "privacy", from: string): string {
  return `/${page}?from=${encodeURIComponent(from)}`;
}
