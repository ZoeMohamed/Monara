import {
  disconnectGmailConnectionInputSchema,
  type GmailDiscovery,
  type GmailSyncStatus,
  gmailConnectionListSchema,
  gmailDiscoverySchema,
  gmailSyncResultSchema,
  operationErrorSchema,
  startGmailConnectionResultSchema,
} from "@monara/contracts";

export type GmailMailbox = {
  id: string;
  email: string;
  status: "active" | "reconnect-required";
  lastSyncedAt: string | null;
  sync:
    | { state: "idle" | "queued" | "running" }
    | {
        state: "completed";
        transactions: number;
        confirmed: number;
        skipped: number;
        failed: number;
      }
    | { state: "failed"; message: string };
};

/** A mailbox whose sync the page should keep checking on. */
export function isSyncInProgress(mailbox: GmailMailbox) {
  return mailbox.sync.state === "queued" || mailbox.sync.state === "running";
}

const SYNC_ERROR_MESSAGES: Record<NonNullable<GmailSyncStatus["error"]>, string> = {
  agent_unavailable: "Gmail sync is unavailable right now. Try again later.",
  gmail_unavailable: "Gmail could not be read. Try again, or reconnect this mailbox.",
  sync_failed: "The sync did not finish. Try again.",
  stalled: "The sync stopped making progress. Try again.",
};

function toMailboxSync(sync: GmailSyncStatus): GmailMailbox["sync"] {
  switch (sync.state) {
    case "idle":
    case "queued":
    case "running":
      return { state: sync.state };
    case "completed":
      return {
        state: "completed",
        transactions: sync.counts.importedTransactions,
        confirmed: sync.counts.confirmedTransactions,
        skipped: sync.counts.skipped,
        failed: sync.counts.failed,
      };
    case "failed":
      return {
        state: "failed",
        message: SYNC_ERROR_MESSAGES[sync.error ?? "sync_failed"],
      };
  }
}

export type GmailConnectionsState =
  | { status: "unavailable" | "loading" | "requires-sign-in" }
  | { status: "error"; message: string }
  | { status: "ready"; mailboxes: GmailMailbox[] };

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;
type RequestOptions = { fetcher?: Fetcher; signal?: AbortSignal };
type ErrorStatus = "requires-sign-in" | "unavailable" | "error";

const CONNECTIONS_URL = "/api/gmail/connections";

export class GmailClientError extends Error {
  readonly status: ErrorStatus;

  constructor(status: ErrorStatus, message: string) {
    super(message);
    this.name = "GmailClientError";
    this.status = status;
  }
}

export function gmailConnectionsErrorState(error: unknown): GmailConnectionsState {
  if (error instanceof GmailClientError) {
    return error.status === "error"
      ? { status: "error", message: error.message }
      : { status: error.status };
  }
  return { status: "error", message: "Your Gmail connections could not be loaded. Try again." };
}

/** Query parameters can explain a callback failure, but never establish a connection. */
export function gmailCallbackError(result: unknown): string | undefined {
  switch (result) {
    case "UNAUTHENTICATED":
      return "Sign in again before connecting Gmail.";
    case "FORBIDDEN":
      return "This Gmail connection was started by a different Monara account. Start again.";
    case "VALIDATION_FAILED":
      return "The Gmail connection link is invalid or expired. Start again.";
    case "CONFLICT":
      return "You can connect at most three Gmail accounts. Disconnect one first.";
    case "DEPENDENCY_UNAVAILABLE":
    case "INTERNAL":
      return "Gmail connections are unavailable right now. Try again later.";
    default:
      return undefined;
  }
}

/** Discovery can search the inbox inline before answering. */
const DISCOVERY_TIMEOUT_MS = 65_000;

async function request(
  path: string,
  method: "GET" | "POST" | "DELETE",
  options: RequestOptions,
  timeoutMs = method === "DELETE" ? 45_000 : 20_000,
) {
  const timeout = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(path, {
      method,
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
    });
  } catch {
    throw new GmailClientError(
      "error",
      method === "GET"
        ? "Could not reach your Gmail connections. Check your connection and try again."
        : "Could not confirm the Gmail change. Reload your connections before trying again.",
    );
  }

  if (response.ok) return response;
  if (response.status === 401) {
    throw new GmailClientError("requires-sign-in", "Sign in before connecting a mailbox.");
  }
  if (response.status === 503) {
    throw new GmailClientError("unavailable", "Gmail connections are unavailable right now.");
  }
  const payload: unknown = await response.json().catch(() => null);
  const error = operationErrorSchema.safeParse(payload);
  if (error.success) {
    const status =
      error.data.code === "UNAUTHENTICATED"
        ? "requires-sign-in"
        : error.data.code === "DEPENDENCY_UNAVAILABLE"
          ? "unavailable"
          : "error";
    throw new GmailClientError(status, error.data.message);
  }
  throw new GmailClientError("error", "The Gmail request could not be completed. Try again.");
}

/** Only validated, public fields from the signed-in User's list reach presentation. */
export async function loadGmailConnections(options: RequestOptions = {}): Promise<GmailMailbox[]> {
  const response = await request(CONNECTIONS_URL, "GET", options);
  const payload: unknown = await response.json().catch(() => null);
  const result = gmailConnectionListSchema.safeParse(payload);
  if (!result.success) {
    throw new GmailClientError("error", "Gmail returned an invalid connection list. Try again.");
  }
  return result.data.connections
    .filter((connection) => connection.status !== "disconnected")
    .map((connection) => ({
      id: connection.id,
      email: connection.gmailAddress,
      status: connection.status === "active" ? "active" : "reconnect-required",
      lastSyncedAt: connection.lastSyncedAt,
      // Stored on the server, so a reload or another tab shows the same sync.
      sync: toMailboxSync(connection.sync),
    }));
}

/** Consent destinations come only from the owned POST endpoint, never browser query input. */
export async function startGmailConnection(options: RequestOptions = {}): Promise<string> {
  const response = await request(CONNECTIONS_URL, "POST", options);
  const payload: unknown = await response.json().catch(() => null);
  const result = startGmailConnectionResultSchema.safeParse(payload);
  if (!result.success) {
    throw new GmailClientError(
      "error",
      "Gmail did not return a valid authorization link. Try again.",
    );
  }
  const url = new URL(result.data.redirectUrl);
  if (url.username || url.password) {
    throw new GmailClientError(
      "error",
      "Gmail did not return a valid authorization link. Try again.",
    );
  }
  return url.href;
}

export async function disconnectGmailConnection(id: string, options: RequestOptions = {}) {
  const input = disconnectGmailConnectionInputSchema.safeParse({ connectionId: id });
  if (!input.success) throw new GmailClientError("error", "Invalid Gmail connection id.");
  const response = await request(
    `${CONNECTIONS_URL}/${encodeURIComponent(input.data.connectionId)}`,
    "DELETE",
    options,
  );
  if (response.status !== 204) {
    throw new GmailClientError("error", "Gmail did not confirm that the mailbox was disconnected.");
  }
}

/** Queues an owned mailbox sync. Completion is asynchronous and is never fabricated here. */
export async function requestGmailSync(id: string, options: RequestOptions = {}) {
  const input = disconnectGmailConnectionInputSchema.safeParse({ connectionId: id });
  if (!input.success) throw new GmailClientError("error", "Invalid Gmail connection id.");
  const response = await request(
    `${CONNECTIONS_URL}/${encodeURIComponent(input.data.connectionId)}/sync`,
    "POST",
    options,
  );
  const payload: unknown = await response.json().catch(() => null);
  const result = gmailSyncResultSchema.safeParse(payload);
  if (!result.success) {
    throw new GmailClientError("error", "Gmail did not confirm that the sync was queued.");
  }
  return result.data;
}

function connectionPath(id: string, suffix: string) {
  const input = disconnectGmailConnectionInputSchema.safeParse({ connectionId: id });
  if (!input.success) throw new GmailClientError("error", "Invalid Gmail connection id.");
  return `${CONNECTIONS_URL}/${encodeURIComponent(input.data.connectionId)}/${suffix}`;
}

/** Banks, cards, and wallets found in one of the User's mailboxes. */
export async function loadGmailDiscovery(
  id: string,
  options: RequestOptions = {},
): Promise<GmailDiscovery> {
  const response = await request(
    connectionPath(id, "discovery"),
    "GET",
    options,
    DISCOVERY_TIMEOUT_MS,
  );
  const payload: unknown = await response.json().catch(() => null);
  const result = gmailDiscoverySchema.safeParse(payload);
  if (!result.success) {
    throw new GmailClientError("error", "Gmail returned invalid account suggestions. Try again.");
  }
  return result.data;
}

/** Looks for the User's banks, cards, and wallets in a mailbox again, and returns what it found. */
export async function requestGmailDiscovery(
  id: string,
  options: RequestOptions = {},
): Promise<GmailDiscovery> {
  const response = await request(
    connectionPath(id, "discovery"),
    "POST",
    options,
    DISCOVERY_TIMEOUT_MS,
  );
  const payload: unknown = await response.json().catch(() => null);
  const result = gmailDiscoverySchema.safeParse(payload);
  if (!result.success) {
    throw new GmailClientError("error", "Gmail returned invalid account suggestions. Try again.");
  }
  return result.data;
}
