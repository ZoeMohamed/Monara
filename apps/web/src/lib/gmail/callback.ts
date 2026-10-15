import { browserOrigin, configuredTunnelOrigin } from "../http/origin.ts";

const GMAIL_CALLBACK_PATH = "/api/gmail/connections/callback";

/** Keep sign-in and Gmail consent on one host so the verifier receives the same session. */
export function gmailPageTunnelRedirect(host: string | null): string | null {
  if (process.env.NODE_ENV !== "development") return null;
  const origin = configuredTunnelOrigin();
  if (!origin || host?.trim().toLowerCase() === new URL(origin).host) return null;
  return new URL("/connections/gmail", origin).toString();
}

/** Composio's identity verifier requires a public HTTPS URL. Local starts fail explicitly. */
export function gmailCallbackUrl(request: Request): string | null {
  const origin = browserOrigin(request);
  const publicOrigin = configuredTunnelOrigin(origin);
  const tunnel = process.env.NODE_ENV === "development" ? configuredTunnelOrigin() : null;
  if (!publicOrigin || (tunnel && tunnel !== publicOrigin)) return null;
  return new URL(GMAIL_CALLBACK_PATH, publicOrigin).toString();
}
