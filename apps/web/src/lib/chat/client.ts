import {
  type AgentChatResponse,
  type AgentChatTurn,
  agentChatRequestSchema,
  type OperationErrorCode,
  operationErrorSchema,
  type WebChatResponse,
  webChatResponseSchema,
} from "@monara/contracts";

type ChatFetch = (input: string, init: RequestInit) => Promise<Response>;
const browserChatSchema = agentChatRequestSchema.omit({ userId: true });
const unverifiableAnswer =
  "Monara's answer couldn't be verified. Check your records before trying again.";

export class ChatClientError extends Error {
  readonly actionMayHaveCompleted: boolean;
  readonly code: OperationErrorCode;
  readonly status: number | null;

  constructor(
    message: string,
    actionMayHaveCompleted = false,
    code: OperationErrorCode = "DEPENDENCY_UNAVAILABLE",
    status: number | null = null,
  ) {
    super(message);
    this.name = "ChatClientError";
    this.actionMayHaveCompleted = actionMayHaveCompleted;
    this.code = code;
    this.status = status;
  }
}

/** Sends one message through the authenticated web bridge and validates the answer. */
export async function sendChatMessage(
  text: string,
  history: AgentChatTurn[],
  fetcher: ChatFetch = fetch,
): Promise<WebChatResponse> {
  const request = browserChatSchema.safeParse({ text, history });
  if (!request.success) {
    throw new ChatClientError(
      request.error.issues.some((issue) => issue.path[0] === "text")
        ? "Write a message of 1 to 4,000 characters."
        : "This conversation could not be verified. Start a new chat.",
      false,
      "VALIDATION_FAILED",
    );
  }
  let response: Response;
  try {
    response = await fetcher("/api/chat", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request.data),
      signal: AbortSignal.timeout(50_000),
    });
  } catch {
    throw new ChatClientError(
      "Monara couldn't be reached. Check your records before trying again.",
      true,
    );
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = operationErrorSchema.safeParse(body);
    throw new ChatClientError(
      error.success ? error.data.message : unverifiableAnswer,
      !error.success || response.status >= 500,
      error.success ? error.data.code : "DEPENDENCY_UNAVAILABLE",
      response.status,
    );
  }
  const result = webChatResponseSchema.safeParse(body);
  if (!result.success || !result.data.reply.trim())
    throw new ChatClientError(unverifiableAnswer, true);
  return result.data;
}

/** Appends one exchange, keeping the newest turns the Agent accepts. */
export function nextHistory(
  history: AgentChatTurn[],
  text: string,
  response: AgentChatResponse,
): AgentChatTurn[] {
  const assistant: AgentChatTurn = {
    role: "assistant",
    text: response.reply.trim().slice(0, 4_000),
  };
  if (response.actions.length > 0) assistant.actions = response.actions.slice(-20);
  if (response.confirmation) assistant.confirmation = response.confirmation;
  const user: AgentChatTurn = { role: "user", text: text.trim().slice(0, 4_000) };
  return [...history, user, assistant].slice(-40);
}
