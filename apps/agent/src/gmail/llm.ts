const REQUEST_TIMEOUT_MS = 60_000;
/**
 * Caps every answer. The results are small JSON objects, and Azure counts a request
 * against its tokens-per-minute limit as prompt plus this cap, so leaving it unset
 * spends the model's whole output limit on every call.
 */
const MAX_OUTPUT_TOKENS = 2_000;
/** A wait the provider asks for that is this short is waited out in the same call. */
const MAX_INLINE_WAIT_MS = 10_000;
const MAX_INLINE_RETRIES = 2;
/** Used when a busy provider does not say how long to wait. */
const DEFAULT_BUSY_WAIT_MS = 2_000;
/** Reasoning tokens count against the cap too, so a reasoning model gets this much more. */
const REASONING_TOKEN_ALLOWANCE = 2_000;
/** gpt-5 and o-series models reason before answering; their names start like this. */
const REASONING_MODEL = /^(openai\/)?(gpt-5|o[1-9])/i;
const REASONING_EFFORTS = new Set(["none", "minimal", "low", "medium", "high"]);

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /**
   * How hard a reasoning model thinks. Unset means "low" for a gpt-5 or o-series model
   * name and nothing for others; set it for an Azure deployment named differently.
   */
  reasoningEffort?: string;
  fetcher?: Fetcher;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Why a model call failed. `rate_limited` and `unavailable` pass with time, so the
 * work should be retried later rather than recorded as failed.
 */
export type LlmFailure = "rate_limited" | "unavailable" | "failed";

/** Thrown when the model call fails. Never carries prompts or responses. */
export class LlmError extends Error {
  readonly status: number | null;
  readonly failure: LlmFailure;
  /** How long the provider asked to wait, when it said. */
  readonly retryAfterMs: number | null;

  constructor(
    message: string,
    status: number | null = null,
    failure: LlmFailure = "failed",
    retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "LlmError";
    this.status = status;
    this.failure = failure;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Whether a failure is the provider being busy or briefly down, not the request. */
export function isTemporaryLlmError(error: unknown): error is LlmError {
  return error instanceof LlmError && error.failure !== "failed";
}

export interface JsonCompletionRequest {
  system: string;
  user: string;
  /** A data: URL of a photo for a model that can see, such as a receipt. */
  imageUrl?: string;
  schemaName: string;
  schema: Record<string, unknown>;
  /** A lower cap for answers known to be short; Azure counts it against its rate limit. */
  maxOutputTokens?: number;
}

export type LlmClient = ReturnType<typeof createLlmClient>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failureOf(status: number): LlmFailure {
  if (status === 429) return "rate_limited";
  if (status === 408 || status >= 500) return "unavailable";
  return "failed";
}

/**
 * The wait a provider asked for: Azure's retry-after-ms, the standard retry-after in
 * seconds or as a date, or OpenRouter's X-RateLimit-Reset in epoch milliseconds.
 */
function retryAfterOf(headers: Headers, now: number): number | null {
  const ms = Number(headers.get("retry-after-ms"));
  if (headers.has("retry-after-ms") && Number.isFinite(ms) && ms >= 0) return ms;
  const after = headers.get("retry-after");
  if (after !== null) {
    const seconds = Number(after);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(after);
    if (Number.isFinite(date)) return Math.max(0, date - now);
  }
  const reset = Number(headers.get("x-ratelimit-reset"));
  if (headers.has("x-ratelimit-reset") && Number.isFinite(reset) && reset > now) {
    return reset - now;
  }
  return null;
}

/** OpenRouter can answer 200 and still carry a provider error in the body. */
function bodyError(payload: unknown): LlmError | null {
  const error = isRecord(payload) ? payload.error : null;
  if (!isRecord(error)) return null;
  const code = typeof error.code === "number" ? error.code : null;
  return new LlmError(
    "The model provider reported an error.",
    code,
    code === null ? "unavailable" : failureOf(code),
  );
}

/** Calls an OpenAI-compatible chat completions endpoint with a strict JSON schema. */
export function createLlmClient(config: LlmConfig) {
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
  const apiKey = config.apiKey.trim();
  const model = config.model.trim();
  if (!baseUrl || !apiKey || !model) {
    throw new Error("Missing required LLM configuration: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL.");
  }
  const configuredEffort = config.reasoningEffort?.trim().toLowerCase() || null;
  const reasoningEffort =
    configuredEffort !== null && REASONING_EFFORTS.has(configuredEffort)
      ? configuredEffort
      : REASONING_MODEL.test(model)
        ? "low"
        : null;
  const host = new URL(baseUrl).hostname;
  // OpenAI and Azure reasoning models reject max_tokens; OpenRouter takes max_tokens.
  const openAiStyle = host.endsWith(".azure.com") || host === "api.openai.com";
  const isOpenRouter = host === "openrouter.ai";
  const fetcher = config.fetcher ?? fetch;
  const sleep =
    config.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  /** The output cap, under the name this provider takes, and the reasoning effort. */
  function limits(request: JsonCompletionRequest): Record<string, unknown> {
    const answer = Math.min(request.maxOutputTokens ?? MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS);
    const cap = answer + (reasoningEffort === null ? 0 : REASONING_TOKEN_ALLOWANCE);
    if (isOpenRouter) {
      return reasoningEffort === null
        ? { max_tokens: cap }
        : { max_tokens: cap, reasoning: { effort: reasoningEffort } };
    }
    const fields: Record<string, unknown> = openAiStyle
      ? { max_completion_tokens: cap }
      : { max_tokens: cap };
    if (reasoningEffort !== null) fields.reasoning_effort = reasoningEffort;
    return fields;
  }

  async function attempt(request: JsonCompletionRequest): Promise<unknown> {
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          ...limits(request),
          messages: [
            { role: "system", content: request.system },
            {
              role: "user",
              content: request.imageUrl
                ? [
                    { type: "text", text: request.user },
                    { type: "image_url", image_url: { url: request.imageUrl } },
                  ]
                : request.user,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: request.schemaName, strict: true, schema: request.schema },
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new LlmError("The model could not be reached.", null, "unavailable");
    }
    if (!response.ok) {
      throw new LlmError(
        "The model request failed.",
        response.status,
        failureOf(response.status),
        retryAfterOf(response.headers, Date.now()),
      );
    }

    // OpenRouter sends whitespace while the model works; a provider failure after that
    // leaves the 200 with a cut-off body, which is worth retrying.
    let payload: unknown;
    try {
      payload = JSON.parse((await response.text()).trim());
    } catch {
      throw new LlmError("The model response was cut off.", response.status, "unavailable");
    }
    const providerError = bodyError(payload);
    if (providerError) throw providerError;
    const choices = isRecord(payload) ? payload.choices : null;
    const first: unknown = Array.isArray(choices) ? choices[0] : null;
    const message = isRecord(first) ? first.message : null;
    const content = isRecord(message) ? message.content : null;
    if (typeof content !== "string") throw new LlmError("The model returned no content.");
    try {
      return JSON.parse(content);
    } catch {
      throw new LlmError("The model output was not JSON.");
    }
  }

  return {
    /**
     * A busy provider that asks for a short wait is retried here; a longer wait is
     * left to the caller, which can put the work back on its queue.
     */
    async completeJson(request: JsonCompletionRequest): Promise<unknown> {
      for (let retry = 0; ; retry += 1) {
        try {
          return await attempt(request);
        } catch (error) {
          // An unreachable model already used up the request timeout; leave it to the queue.
          if (!isTemporaryLlmError(error) || error.status === null || retry >= MAX_INLINE_RETRIES) {
            throw error;
          }
          const wait = error.retryAfterMs ?? DEFAULT_BUSY_WAIT_MS * 2 ** retry;
          if (wait > MAX_INLINE_WAIT_MS) throw error;
          await sleep(wait + Math.floor(Math.random() * 500));
        }
      }
    },
  };
}
