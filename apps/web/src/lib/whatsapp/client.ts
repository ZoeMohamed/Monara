import {
  type OperationErrorCode,
  operationErrorSchema,
  type StartWhatsAppLinkResult,
  startWhatsAppLinkInputSchema,
  startWhatsAppLinkResultSchema,
  type WhatsAppLinkStatus,
  whatsAppLinkStatusSchema,
} from "@monara/contracts";

const LINK_URL = "/api/whatsapp/link";

type RequestOptions = {
  signal?: AbortSignal;
  fetcher?: (url: string, options: RequestInit) => Promise<Response>;
};

export class WhatsAppLinkClientError extends Error {
  readonly code: OperationErrorCode;
  readonly actionMayHaveCompleted: boolean;

  constructor(code: OperationErrorCode, message: string, actionMayHaveCompleted = false) {
    super(message);
    this.name = "WhatsAppLinkClientError";
    this.code = code;
    this.actionMayHaveCompleted = actionMayHaveCompleted;
  }
}

function invalidResponse(mutation: boolean): never {
  throw new WhatsAppLinkClientError(
    "DEPENDENCY_UNAVAILABLE",
    mutation
      ? "The WhatsApp change could not be confirmed. Check status before trying again."
      : "Your WhatsApp status could not be verified. Try again.",
    mutation,
  );
}

async function request(
  method: "GET" | "POST" | "DELETE",
  body: unknown,
  options: RequestOptions,
): Promise<unknown> {
  const mutation = method !== "GET";
  options.signal?.throwIfAborted();
  const timeout = AbortSignal.timeout(15_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let response: Response;
  let payload: unknown;
  try {
    response = await (options.fetcher ?? fetch)(LINK_URL, {
      method,
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    payload = await response.json().catch(() => null);
    // A mocked or late response must not undo cancellation.
    options.signal?.throwIfAborted();
  } catch {
    options.signal?.throwIfAborted();
    throw new WhatsAppLinkClientError(
      "DEPENDENCY_UNAVAILABLE",
      mutation
        ? "The WhatsApp change could not be confirmed. Check status before trying again."
        : "Could not load your WhatsApp status. Check your connection and try again.",
      mutation,
    );
  }

  if (!response.ok) {
    const error = operationErrorSchema.safeParse(payload);
    if (response.status === 401) {
      throw new WhatsAppLinkClientError("UNAUTHENTICATED", "Sign in again to manage WhatsApp.");
    }
    if (error.success) {
      const uncertain = mutation && response.status >= 500;
      throw new WhatsAppLinkClientError(
        error.data.code,
        uncertain ? `${error.data.message} Check status before trying again.` : error.data.message,
        uncertain,
      );
    }
    invalidResponse(mutation);
  }
  return payload;
}

/** Only validated, owned public status reaches the settings row. */
export async function loadWhatsAppLink(options: RequestOptions = {}): Promise<WhatsAppLinkStatus> {
  const result = whatsAppLinkStatusSchema.safeParse(await request("GET", undefined, options));
  if (!result.success) invalidResponse(false);
  return result.data;
}

export function sendWhatsAppLink(
  method: "POST",
  body: unknown,
  options?: RequestOptions,
): Promise<StartWhatsAppLinkResult>;
export function sendWhatsAppLink(
  method: "DELETE",
  body?: undefined,
  options?: RequestOptions,
): Promise<undefined>;
export async function sendWhatsAppLink(
  method: "POST" | "DELETE",
  body: unknown = undefined,
  options: RequestOptions = {},
): Promise<StartWhatsAppLinkResult | undefined> {
  if (method === "POST") {
    const input = startWhatsAppLinkInputSchema.safeParse(body);
    if (!input.success) {
      throw new WhatsAppLinkClientError(
        "VALIDATION_FAILED",
        "Enter your number with its country code, like +62 812 3456 7890.",
      );
    }
    const result = startWhatsAppLinkResultSchema.safeParse(
      await request("POST", input.data, options),
    );
    if (!result.success) invalidResponse(true);
    return result.data;
  }

  const result = await request("DELETE", undefined, options);
  if (
    typeof result !== "object" ||
    result === null ||
    Array.isArray(result) ||
    Object.keys(result).length !== 1 ||
    !("ok" in result) ||
    result.ok !== true
  ) {
    invalidResponse(true);
  }
  return undefined;
}
