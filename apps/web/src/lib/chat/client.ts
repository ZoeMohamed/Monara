import {
  type AgentChatResponse,
  type AgentChatTurn,
  type ChatHistorySaveStatus,
  chatHistorySaveStatusSchema,
  type OperationErrorCode,
  operationErrorSchema,
  type SavedChatConversation,
  type SavedChatMessage,
  savedChatListSchema,
  savedChatMessagesSchema,
  type WebChatBridgeResponse,
  webChatBridgeResponseSchema,
  webChatRequestSchema,
} from "@monara/contracts";

type ChatFetch = (input: string, init: RequestInit) => Promise<Response>;
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
  conversationId: string,
  fetcher: ChatFetch = fetch,
): Promise<WebChatBridgeResponse> {
  const request = webChatRequestSchema.safeParse({
    text,
    history,
    conversationId,
    historyRecovery: true,
  });
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
      signal: AbortSignal.timeout(55_000),
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
  const result = webChatBridgeResponseSchema.safeParse(body);
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

async function readSaved<T>(
  path: string,
  parse: (body: unknown) => T | null,
  failure: string,
  fetcher: ChatFetch,
): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(path, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error(failure);
  }
  const parsed = response.ok ? parse(await response.json().catch(() => null)) : null;
  if (parsed === null) throw new Error(failure);
  return parsed;
}

/** The signed-in User's saved chats, newest first. */
export function loadChatConversations(
  fetcher: ChatFetch = fetch,
): Promise<SavedChatConversation[]> {
  return readSaved(
    "/api/chat/conversations",
    (body) => {
      const result = savedChatListSchema.safeParse(body);
      return result.success ? result.data.conversations : null;
    },
    "Monara couldn't load your saved chats.",
    fetcher,
  );
}

/** The newest messages of one saved chat, oldest first. */
export function loadChatMessages(
  conversationId: string,
  fetcher: ChatFetch = fetch,
): Promise<SavedChatMessage[]> {
  return readSaved(
    `/api/chat/conversations/${encodeURIComponent(conversationId)}`,
    (body) => {
      const result = savedChatMessagesSchema.safeParse(body);
      return result.success ? result.data.messages : null;
    },
    "Monara couldn't load this chat.",
    fetcher,
  );
}

/** Save-only retry. The signed receipt contains the original verified exchange. */
export async function retryChatHistorySave(
  pending: Extract<ChatHistorySaveStatus, { status: "pending" }>,
  fetcher: ChatFetch = fetch,
): Promise<Extract<ChatHistorySaveStatus, { status: "saved" }>> {
  let response: Response;
  try {
    response = await fetcher("/api/chat/conversations/retry", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recoveryToken: pending.recoveryToken }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("History couldn’t be reached. Keep this page open and try saving again.");
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = operationErrorSchema.safeParse(body);
    throw new Error(
      error.success ? error.data.message : "This reply couldn’t be saved to history yet.",
    );
  }
  const saved = chatHistorySaveStatusSchema.safeParse(body);
  if (
    !saved.success ||
    saved.data.status !== "saved" ||
    saved.data.exchangeId !== pending.exchangeId
  )
    throw new Error(
      "The history save couldn’t be verified. Keep this page open and try saving again.",
    );
  return saved.data;
}
