// Adlyn implements this adapter using Composio. Connections must already be
// verified as belonging to the User before an adapter receives them.
export interface GmailConnector {
  readMessage(input: {
    connectionId: string;
    messageId: string;
  }): Promise<{ text: string; html?: string }>;
}

const REQUEST_TIMEOUT_MS = 15_000;

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

export interface ComposioGmailConfig {
  /** Composio REST base URL including the version, e.g. https://backend.composio.dev/api/v3.1 */
  apiUrl: string;
  apiKey: string;
  authConfigId: string;
  fetcher?: Fetcher;
}

/**
 * Why Composio refused to complete a connection. "identity_mismatch" means the
 * Google account was consented under a different Monara User than the one who
 * returned, which is the OAuth session fixation case Composio guards against.
 */
export type CompleteConnectionResult =
  | { ok: true; connectedAccountId: string; toolkit: string }
  | { ok: false; reason: "identity_mismatch" | "expired" };

/** Thrown for transport failures and unexpected responses. Never carries response bodies. */
export class ComposioRequestError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "ComposioRequestError";
    this.status = status;
  }
}

function requireValue(name: string, value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Missing required Composio configuration: ${name}.`);
  return normalized;
}

/** Requires an https URL (http only for a local mock) and drops any trailing slash. */
function requireApiUrl(value: string): string {
  const raw = requireValue("COMPOSIO_API_URL", value);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("COMPOSIO_API_URL must be an absolute URL.");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("COMPOSIO_API_URL must use https.");
  }
  return raw.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  return typeof field === "string" && field.length > 0 ? field : null;
}

/**
 * GMAIL_GET_PROFILE may wrap its fields under one or two `data` levels, so look
 * for emailAddress there rather than assuming one shape.
 */
function findEmailAddress(value: unknown): string | null {
  let current = value;
  for (let depth = 0; depth < 3 && isRecord(current); depth++) {
    const email = readString(current, "emailAddress");
    if (email) return email;
    current = current.data;
  }
  return null;
}

/**
 * Talks to Composio's REST API with fetch only, so the same client runs in
 * Next.js on Vercel and in the Cloudflare worker.
 */
export function createComposioGmailClient(config: ComposioGmailConfig) {
  const apiUrl = requireApiUrl(config.apiUrl);
  const apiKey = requireValue("COMPOSIO_API_KEY", config.apiKey);
  const authConfigId = requireValue("COMPOSIO_GMAIL_AUTH_CONFIG_ID", config.authConfigId);
  const fetcher = config.fetcher ?? fetch;

  async function request(method: "POST" | "DELETE", path: string, body?: unknown) {
    let response: Response;
    try {
      response = await fetcher(`${apiUrl}${path}`, {
        method,
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new ComposioRequestError(`Composio ${method} ${path} could not be reached.`);
    }
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // Some successful deletes have no body; non-2xx statuses are reported by callers.
    }
    return { status: response.status, ok: response.ok, payload };
  }

  return {
    /** Starts a Composio Connect Link for this Monara User. */
    async createConnectLink(input: { userId: string; callbackUrl: string }) {
      const result = await request("POST", "/connected_accounts/link", {
        auth_config_id: authConfigId,
        user_id: input.userId,
        callback_url: input.callbackUrl,
      });
      const redirectUrl = isRecord(result.payload)
        ? readString(result.payload, "redirect_url")
        : null;
      if (!result.ok || !redirectUrl) {
        throw new ComposioRequestError("Composio did not create a connect link.", result.status);
      }
      return { redirectUrl };
    },

    /**
     * Redeems the single-use session_uri from Composio's callback identity
     * verification. Composio activates the connection only when userId is the
     * User who started it.
     */
    async completeConnection(input: {
      sessionUri: string;
      userId: string;
    }): Promise<CompleteConnectionResult> {
      const result = await request("POST", "/connected_accounts/complete_auth", {
        session_uri: input.sessionUri,
        user_id: input.userId,
      });
      if (result.status === 400) return { ok: false, reason: "identity_mismatch" };
      if (result.status === 404) return { ok: false, reason: "expired" };
      const payload = isRecord(result.payload) ? result.payload : {};
      const connectedAccountId = readString(payload, "connected_account_id");
      const toolkit = readString(payload, "toolkit_slug");
      if (!result.ok || !connectedAccountId || !toolkit) {
        throw new ComposioRequestError("Composio did not complete the connection.", result.status);
      }
      return { ok: true, connectedAccountId, toolkit };
    },

    /** Reads the mailbox address of an active connection with GMAIL_GET_PROFILE. */
    async getGmailAddress(input: { userId: string; connectedAccountId: string }) {
      const result = await request("POST", "/tools/execute/GMAIL_GET_PROFILE", {
        user_id: input.userId,
        connected_account_id: input.connectedAccountId,
        arguments: { user_id: "me" },
      });
      const email =
        isRecord(result.payload) && result.payload.successful === true
          ? findEmailAddress(result.payload.data)
          : null;
      if (!result.ok || !email) {
        throw new ComposioRequestError("Composio could not read the Gmail profile.", result.status);
      }
      return email.toLowerCase();
    },

    /** Deletes the connection at Composio, which also discards its Google tokens. */
    async deleteConnection(connectedAccountId: string) {
      const result = await request(
        "DELETE",
        `/connected_accounts/${encodeURIComponent(connectedAccountId)}`,
      );
      // Already gone is the state we want.
      if (!result.ok && result.status !== 404) {
        throw new ComposioRequestError("Composio did not delete the connection.", result.status);
      }
    },
  };
}

export type ComposioGmailClient = ReturnType<typeof createComposioGmailClient>;
