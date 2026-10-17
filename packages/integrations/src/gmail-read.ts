// Reads Gmail through Composio tool execution. The connection must already be
// resolved to its owner by the backend before any of these calls are made.

// Gmail list calls through Composio regularly take more than 20 seconds for a
// full page. Keep a finite ceiling while allowing the provider to finish.
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_PAGE_SIZE = 100;

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

export interface ComposioGmailReaderConfig {
  /** Composio API base URL, e.g. https://backend.composio.dev/api/v3.1. */
  apiUrl: string;
  apiKey: string;
  fetcher?: Fetcher;
}

export interface GmailMailbox {
  /** The Monara User id that owns the Composio connected account. */
  userId: string;
  connectedAccountId: string;
}

export interface GmailMessageSummary {
  id: string;
  /** ISO timestamp, or null when the listing did not include one. */
  receivedAt: string | null;
  /** The From address alone, lowercased, when the listing included it. */
  senderAddress: string | null;
  subject: string | null;
}

export interface GmailMessagePage {
  messages: GmailMessageSummary[];
  nextPageToken: string | null;
}

export interface GmailMessageContent {
  id: string;
  receivedAt: string;
  from: string | null;
  /** The From address alone, lowercased. */
  fromAddress: string | null;
  subject: string | null;
  text: string | null;
  html: string | null;
  /** Authentication-Results header values, in the order Gmail lists them (newest first). */
  authenticationResults: string[];
}

/**
 * Thrown for transport failures and unexpected responses. Never carries response bodies;
 * `code` is only Composio's machine-readable error slug, kept so failures can be diagnosed.
 */
export class GmailReadError extends Error {
  readonly status: number | null;
  readonly code: string | null;

  constructor(message: string, status: number | null = null, code: string | null = null) {
    super(message);
    this.name = "GmailReadError";
    this.status = status;
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: Record<string, unknown>, key: string): string | null {
  const field = value[key];
  return typeof field === "string" && field.length > 0 ? field : null;
}

/** Matches Composio's documented JSON error envelope for a missing resource. */
function isComposioNotFound(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.error)) return false;
  const error = value.error;
  const slug = readString(error, "slug");
  return error.status === 404 && slug !== null && /^not[_-]?found(?:[_-]?error)?$/i.test(slug);
}

/** Reads Composio's error slug (or numeric code) from an error envelope, never its message. */
function readErrorCode(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.error)) return null;
  const slug = readString(value.error, "slug");
  if (slug && /^[\w.-]{1,80}$/.test(slug)) return slug;
  const code = value.error.code;
  return typeof code === "number" && Number.isInteger(code) ? String(code) : null;
}

/** Composio may wrap tool output in one or two `data` levels. */
function unwrapData(value: unknown): Record<string, unknown> | null {
  let current = value;
  for (let depth = 0; depth < 3 && isRecord(current); depth++) {
    if (!isRecord(current.data)) return current;
    current = current.data;
  }
  return isRecord(current) ? current : null;
}

/** Accepts Gmail's epoch-millisecond internalDate or an ISO timestamp. */
function toIsoTimestamp(value: unknown): string | null {
  if (typeof value === "string" && /^\d{10,16}$/.test(value)) {
    return new Date(Number(value)).toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  return null;
}

function readTimestamp(message: Record<string, unknown>): string | null {
  return toIsoTimestamp(message.internalDate) ?? toIsoTimestamp(message.messageTimestamp);
}

/** Decodes Gmail's base64url body data as UTF-8. */
export function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function readHeaders(payload: Record<string, unknown>, name: string): string[] {
  const headers = payload.headers;
  if (!Array.isArray(headers)) return [];
  const values: string[] = [];
  for (const header of headers) {
    if (isRecord(header) && readString(header, "name")?.toLowerCase() === name) {
      const value = readString(header, "value");
      if (value) values.push(value);
    }
  }
  return values;
}

function readHeader(payload: Record<string, unknown>, name: string): string | null {
  return readHeaders(payload, name)[0] ?? null;
}

/** The address in a From value such as `BCA <bca@bca.co.id>`, lowercased. */
export function parseSenderAddress(from: string | null): string | null {
  if (!from) return null;
  const match =
    from.match(/<([^<>\s]+@[^<>\s]+)>\s*$/) ?? from.match(/^\s*([^<>\s]+@[^<>\s]+)\s*$/);
  return match ? match[1].toLowerCase() : null;
}

/** Walks the MIME tree and returns the first text/plain and text/html bodies. */
function collectBodies(part: unknown, bodies: { text: string | null; html: string | null }) {
  if (!isRecord(part)) return;
  const mimeType = readString(part, "mimeType");
  const body = isRecord(part.body) ? readString(part.body, "data") : null;
  if (body && mimeType === "text/plain" && bodies.text === null)
    bodies.text = decodeBase64Url(body);
  if (body && mimeType === "text/html" && bodies.html === null) bodies.html = decodeBase64Url(body);
  if (Array.isArray(part.parts)) {
    for (const child of part.parts) collectBodies(child, bodies);
  }
}

/** Requires https, except http for local stubs. */
function readApiUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");
  if (!normalized) throw new Error("Missing required Composio configuration: COMPOSIO_API_URL.");
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("Invalid Composio configuration: COMPOSIO_API_URL.");
  }
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) {
    throw new Error("Invalid Composio configuration: COMPOSIO_API_URL must use https.");
  }
  return normalized;
}

/** Composio connected account states that can no longer read mail without the User reconnecting. */
const UNUSABLE_ACCOUNT_STATES = new Set(["EXPIRED", "FAILED", "INACTIVE"]);

export function createComposioGmailReader(config: ComposioGmailReaderConfig) {
  const apiUrl = readApiUrl(config.apiUrl);
  const toolsUrl = `${apiUrl}/tools/execute`;
  const apiKey = config.apiKey.trim();
  if (!apiKey) throw new Error("Missing required Composio configuration: COMPOSIO_API_KEY.");
  const fetcher = config.fetcher ?? fetch;

  async function execute(
    slug: string,
    mailbox: GmailMailbox,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await fetcher(`${toolsUrl}/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({
          user_id: mailbox.userId,
          connected_account_id: mailbox.connectedAccountId,
          arguments: args,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new GmailReadError(`Composio ${slug} could not be reached.`);
    }
    if (!response.ok) {
      const errorPayload: unknown = await response.json().catch(() => null);
      throw new GmailReadError(
        `Composio ${slug} failed.`,
        response.status,
        readErrorCode(errorPayload),
      );
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new GmailReadError(`Composio ${slug} returned invalid JSON.`, response.status);
    }
    if (!isRecord(payload) || payload.successful !== true) {
      // Composio answers 200 when Gmail itself refused; keep only Gmail's status number.
      const gmailStatus = isRecord(payload)
        ? readString(payload, "error")?.match(/^(?:HTTP\s+)?([45]\d\d)\b/)
        : null;
      throw new GmailReadError(
        `Composio ${slug} was not successful.`,
        gmailStatus ? Number(gmailStatus[1]) : response.status,
      );
    }
    const data = unwrapData(payload.data);
    if (!data) throw new GmailReadError(`Composio ${slug} returned no data.`, response.status);
    return data;
  }

  return {
    /**
     * Asks Composio whether the connected account can still be used. Returns false only
     * when Composio says so; a failed check (for example a bad API key) throws instead.
     */
    async isConnectionUsable(connectedAccountId: string): Promise<boolean> {
      let response: Response;
      try {
        response = await fetcher(
          `${apiUrl}/connected_accounts/${encodeURIComponent(connectedAccountId)}`,
          {
            method: "GET",
            headers: { "x-api-key": apiKey },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          },
        );
      } catch {
        throw new GmailReadError("Composio connected account could not be reached.");
      }
      if (response.status === 404) {
        const payload: unknown = await response.json().catch(() => null);
        if (isComposioNotFound(payload)) return false;
        throw new GmailReadError("Composio connected account check failed.", response.status);
      }
      if (!response.ok) {
        throw new GmailReadError("Composio connected account check failed.", response.status);
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new GmailReadError(
          "Composio connected account returned invalid JSON.",
          response.status,
        );
      }
      const status = isRecord(payload) ? readString(payload, "status") : null;
      if (!status) {
        throw new GmailReadError("Composio connected account has no status.", response.status);
      }
      return !UNUSABLE_ACCOUNT_STATES.has(status.toUpperCase());
    },

    /** Lists message ids matching a Gmail search query, newest pages first as Gmail returns them. */
    async listMessages(
      mailbox: GmailMailbox,
      input: { query: string; pageToken?: string | null; maxResults: number },
    ): Promise<GmailMessagePage> {
      const data = await execute("GMAIL_FETCH_EMAILS", mailbox, {
        query: input.query,
        max_results: Math.min(Math.max(1, input.maxResults), MAX_PAGE_SIZE),
        verbose: false,
        include_payload: false,
        ...(input.pageToken ? { page_token: input.pageToken } : {}),
      });
      const messages: GmailMessageSummary[] = [];
      if (Array.isArray(data.messages)) {
        for (const message of data.messages) {
          if (!isRecord(message)) continue;
          const id = readString(message, "messageId") ?? readString(message, "id");
          if (id) {
            messages.push({
              id,
              receivedAt: readTimestamp(message),
              senderAddress: parseSenderAddress(readString(message, "sender")),
              subject: readString(message, "subject"),
            });
          }
        }
      }
      return { messages, nextPageToken: readString(data, "nextPageToken") };
    },

    /** Fetches one message with its decoded text and HTML bodies. */
    async getMessage(mailbox: GmailMailbox, messageId: string): Promise<GmailMessageContent> {
      const data = await execute("GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID", mailbox, {
        message_id: messageId,
        format: "full",
      });
      const receivedAt = readTimestamp(data);
      if (!receivedAt) throw new GmailReadError("Composio message has no timestamp.");

      const payload = isRecord(data.payload) ? data.payload : null;
      const bodies = { text: null as string | null, html: null as string | null };
      if (payload) collectBodies(payload, bodies);
      // Composio may also return a pre-extracted plain-text body.
      bodies.text ??= readString(data, "messageText");

      const from = (payload && readHeader(payload, "from")) ?? readString(data, "sender");
      return {
        id: readString(data, "messageId") ?? readString(data, "id") ?? messageId,
        receivedAt,
        from,
        fromAddress: parseSenderAddress(from),
        subject: (payload && readHeader(payload, "subject")) ?? readString(data, "subject"),
        text: bodies.text,
        html: bodies.html,
        authenticationResults: payload ? readHeaders(payload, "authentication-results") : [],
      };
    },
  };
}

export type ComposioGmailReader = ReturnType<typeof createComposioGmailReader>;
