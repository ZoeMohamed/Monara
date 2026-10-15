const REQUEST_TIMEOUT_MS = 60_000;

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetcher?: Fetcher;
}

/** Thrown when the model call fails. Never carries prompts or responses. */
class LlmError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "LlmError";
    this.status = status;
  }
}

export interface JsonCompletionRequest {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
}

export type LlmClient = ReturnType<typeof createLlmClient>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Calls an OpenAI-compatible chat completions endpoint with a strict JSON schema. */
export function createLlmClient(config: LlmConfig) {
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
  const apiKey = config.apiKey.trim();
  const model = config.model.trim();
  if (!baseUrl || !apiKey || !model) {
    throw new Error("Missing required LLM configuration: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL.");
  }
  const fetcher = config.fetcher ?? fetch;

  return {
    async completeJson(request: JsonCompletionRequest): Promise<unknown> {
      let response: Response;
      try {
        response = await fetcher(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: request.user },
            ],
            response_format: {
              type: "json_schema",
              json_schema: { name: request.schemaName, strict: true, schema: request.schema },
            },
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch {
        throw new LlmError("The model could not be reached.");
      }
      if (!response.ok) throw new LlmError("The model request failed.", response.status);

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new LlmError("The model returned invalid JSON.", response.status);
      }
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
    },
  };
}
