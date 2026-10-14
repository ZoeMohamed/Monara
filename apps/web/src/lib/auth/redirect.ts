const DEFAULT_PATH = "/";

/** Accepts only same-origin path redirects, never absolute or protocol-relative URLs. */
export function safeNextPath(value: string | null | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return DEFAULT_PATH;

  try {
    const parsed = new URL(value, "https://monara.invalid");
    if (parsed.origin !== "https://monara.invalid") return DEFAULT_PATH;
    if (!parsed.pathname.startsWith("/") || parsed.pathname.startsWith("//")) return DEFAULT_PATH;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_PATH;
  }
}

/** Resolves a safe post-auth destination without looping back to the sign-in page. */
export function safeAuthenticatedNextPath(value: string | null | undefined): string {
  const next = safeNextPath(value);
  const parsed = new URL(next, "https://monara.invalid");
  return parsed.pathname === "/sign-in" ? DEFAULT_PATH : next;
}

export function signInErrorMessage(code: string | null | undefined): string | undefined {
  switch (code) {
    case "oauth_callback_failed":
      return "Google could not finish signing you in. Please try again.";
    case "oauth_start_failed":
      return "Google sign-in is unavailable right now. Please try again later.";
    case "session_invalid":
      return "Your sign-in session could not be verified. Please try again.";
    default:
      return undefined;
  }
}
