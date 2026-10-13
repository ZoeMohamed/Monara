export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type AssistantMessage = Extract<ChatMessage, { role: "assistant" }>;

export interface ToolDefinition {
  type: "function";
  function: { name: string; description: string; parameters: unknown };
}

/** One model call. Injected into the Agent so the tool loop can be tested without a provider. */
export type Complete = (
  messages: ChatMessage[],
  tools: ToolDefinition[],
) => Promise<AssistantMessage>;

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 2;

const FILTERED_REPLY =
  "I can't help with that request. I can help you track spending, income, budgets, and bills.";

// The provider's safety filter rejects some prompts outright, typically attempts
// to override the Agent's instructions. That is a refusal, not an outage.
async function isContentFiltered(response: Response): Promise<boolean> {
  const body = (await response.json().catch(() => null)) as { error?: { code?: unknown } } | null;
  return body?.error?.code === "content_filter";
}

/** Calls an OpenAI-compatible chat completions endpoint. */
export function createComplete(config: {
  baseUrl: string;
  apiKey: string;
  model: string;
}): Complete {
  const url = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  return async (messages, tools) => {
    let status = 0;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          messages,
          // Some providers reject an empty tools array. The team's model only accepts
          // function tools on this endpoint with reasoning turned off.
          ...(tools.length > 0 ? { tools, tool_choice: "auto", reasoning_effort: "none" } : {}),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) {
        const data = (await response.json()) as { choices?: { message?: AssistantMessage }[] };
        const message = data.choices?.[0]?.message;
        if (!message) throw new Error("The model returned no message.");
        return {
          role: "assistant",
          content: message.content ?? null,
          tool_calls: message.tool_calls,
        };
      }
      status = response.status;
      if (status === 400 && (await isContentFiltered(response))) {
        return { role: "assistant", content: FILTERED_REPLY };
      }
      if (status !== 429 && status < 500) break;
    }
    // The response body can echo the conversation, so only the status is reported.
    throw new Error(`The model request failed with status ${status}.`);
  };
}
