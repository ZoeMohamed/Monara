// Composio's new-mail trigger for Gmail: one trigger per mailbox, filtered to the
// senders of the accounts that mailbox feeds, and the signed webhook it delivers.
// Uses only fetch and Web Crypto, so it runs in Node and in Workers.
import { readApiUrl } from "./gmail-read.ts";

const REQUEST_TIMEOUT_MS = 15_000;
/** Composio's Gmail new-message trigger. */
export const GMAIL_NEW_MESSAGE_TRIGGER = "GMAIL_NEW_GMAIL_MESSAGE";
/** Webhooks older or newer than this are rejected as possible replays. */
const WEBHOOK_TOLERANCE_SECONDS = 300;

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

/** A failed trigger call. Carries the HTTP status only, never response bodies. */
export class ComposioTriggerError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "ComposioTriggerError";
    this.status = status;
  }
}

/** The Gmail search the trigger polls with: mail from these senders only. */
export function newMailTriggerQuery(senders: readonly string[]): string {
  return `from:(${senders.join(" OR ")})`;
}

export interface ComposioGmailTriggersConfig {
  apiUrl: string;
  apiKey: string;
  fetcher?: Fetcher;
}

export type ComposioGmailTriggers = ReturnType<typeof createComposioGmailTriggers>;

export function createComposioGmailTriggers(config: ComposioGmailTriggersConfig) {
  const apiUrl = readApiUrl(config.apiUrl);
  const apiKey = config.apiKey.trim();
  if (!apiKey) throw new Error("Missing required Composio configuration: COMPOSIO_API_KEY.");
  const fetcher = config.fetcher ?? fetch;

  async function send(path: string, init: RequestInit): Promise<Response> {
    try {
      return await fetcher(`${apiUrl}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", "x-api-key": apiKey },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new ComposioTriggerError("Composio triggers could not be reached.");
    }
  }

  return {
    /**
     * Creates or updates the mailbox's new-mail trigger to watch these senders, and
     * returns its id. Upserting the same connected account updates its one trigger.
     */
    async upsert(input: {
      connectedAccountId: string;
      senders: readonly string[];
    }): Promise<string> {
      if (input.senders.length === 0) throw new Error("A trigger needs at least one sender.");
      const response = await send(
        `/trigger_instances/${encodeURIComponent(GMAIL_NEW_MESSAGE_TRIGGER)}/upsert`,
        {
          method: "POST",
          body: JSON.stringify({
            connected_account_id: input.connectedAccountId,
            trigger_config: { query: newMailTriggerQuery(input.senders) },
          }),
        },
      );
      if (!response.ok) {
        throw new ComposioTriggerError("Composio did not save the trigger.", response.status);
      }
      const payload: unknown = await response.json().catch(() => null);
      const triggerId =
        typeof payload === "object" && payload !== null && "trigger_id" in payload
          ? payload.trigger_id
          : null;
      if (typeof triggerId !== "string" || triggerId.length === 0) {
        throw new ComposioTriggerError("Composio returned no trigger id.", response.status);
      }
      return triggerId;
    },

    /** Deletes a trigger; one that is already gone counts as deleted. */
    async remove(triggerId: string): Promise<void> {
      const response = await send(`/trigger_instances/manage/${encodeURIComponent(triggerId)}`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 404) {
        throw new ComposioTriggerError("Composio did not delete the trigger.", response.status);
      }
    },
  };
}

function base64(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function equalStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * Checks a Composio webhook signature: base64 HMAC-SHA256 of
 * "{webhook-id}.{webhook-timestamp}.{raw body}" keyed with the webhook secret, within
 * five minutes of now. The header may hold several space-separated "v1,<signature>"
 * entries. A missing secret or header never verifies.
 */
export async function verifyComposioWebhook(input: {
  secret: string | undefined;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  now?: Date;
}): Promise<boolean> {
  const secret = input.secret?.trim();
  if (!secret || !input.id || !input.timestamp || !input.signature) return false;
  const seconds = Number(input.timestamp);
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (!Number.isInteger(seconds) || Math.abs(nowSeconds - seconds) > WEBHOOK_TOLERANCE_SECONDS) {
    return false;
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = base64(
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`${input.id}.${input.timestamp}.${input.body}`),
    ),
  );
  return input.signature
    .split(" ")
    .map((entry) => entry.slice(entry.indexOf(",") + 1))
    .some((candidate) => equalStrings(candidate, expected));
}

/** What Monara needs from a verified trigger event. */
export interface ComposioGmailEvent {
  triggerSlug: string;
  connectedAccountId: string;
  gmailMessageId: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Reads a trigger event in Composio's current (V3) or legacy V2 shape. Returns null
 * for anything else, or for an event without a message id; nothing else is read.
 */
export function parseComposioGmailEvent(payload: unknown): ComposioGmailEvent | null {
  const event = record(payload);
  const data = record(event?.data);
  if (!event || !data) return null;
  const metadata = record(event.metadata);
  const triggerSlug = text(metadata?.trigger_slug) ?? text(event.type)?.toUpperCase() ?? null;
  const connectedAccountId = text(metadata?.connected_account_id) ?? text(data.connection_nano_id);
  const gmailMessageId = text(data.message_id) ?? text(data.id);
  if (!triggerSlug || !connectedAccountId || !gmailMessageId || gmailMessageId.length > 500) {
    return null;
  }
  return { triggerSlug, connectedAccountId, gmailMessageId };
}
