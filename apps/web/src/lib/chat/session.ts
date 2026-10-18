import type { AgentChatTurn, SavedChatConversation, SavedChatMessage } from "@monara/contracts";
import type { ChatReply } from "../../components/chat-action-result.tsx";
import type { ChatReceiptSelection } from "./receipts.ts";

export type ChatRecovery = {
  message: string;
  requiresRecordCheck: boolean;
  signInRequired: boolean;
  recordsOpened: boolean;
};

export function chatRecoveryForFailure(failure: unknown): ChatRecovery {
  const uncertain =
    failure instanceof Error &&
    "actionMayHaveCompleted" in failure &&
    failure.actionMayHaveCompleted === true;
  const signInRequired =
    !uncertain &&
    failure instanceof Error &&
    "code" in failure &&
    failure.code === "UNAUTHENTICATED";
  return {
    message: signInRequired
      ? "Your sign-in has expired, so this message wasn’t sent. Copy your draft before signing in again."
      : uncertain
        ? "The reply was interrupted. Your change may already be saved. Check History before sending it again. Your message is still here."
        : "Your message is still here. Edit it or send it again when you’re ready.",
    requiresRecordCheck: uncertain,
    signInRequired,
    recordsOpened: false,
  };
}

export type ChatMessage = {
  id: string;
  role: "user" | "agent" | "error";
  text: string;
  result?: ChatReply;
  closedConfirmation?: boolean;
  receiptName?: string;
};

export type ChatConversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  history: AgentChatTurn[];
  updatedAt: string | null;
  /** False for a saved chat whose messages have not been fetched yet. */
  loaded: boolean;
  /** Messages saved on the server. Only meaningful until the chat is loaded. */
  messageCount: number;
  draft: string;
  receipt: ChatReceiptSelection | null;
  recovery: ChatRecovery | null;
};

export type ChatSessionState = {
  activeId: string;
  conversations: ChatConversation[];
  /** True once the User's saved chats have been merged in. */
  listed: boolean;
};

function emptyChat(id: string): ChatConversation {
  return {
    id,
    title: "New chat",
    messages: [],
    history: [],
    updatedAt: null,
    loaded: true,
    messageCount: 0,
    draft: "",
    receipt: null,
    recovery: null,
  };
}

export function initialChatSession(id: string = crypto.randomUUID()): ChatSessionState {
  return { activeId: id, conversations: [emptyChat(id)], listed: false };
}

/** What the Agent should remember of a saved chat: its newest turns, as it saw them. */
function historyFromSaved(messages: SavedChatMessage[]): AgentChatTurn[] {
  return messages
    .map((message): AgentChatTurn => {
      const text = message.text.slice(0, 4_000);
      if (message.role === "user") return { role: "user", text };
      const actions = message.result?.actions.slice(-20) ?? [];
      return actions.length > 0
        ? { role: "assistant", text, actions }
        : { role: "assistant", text };
    })
    .slice(-40);
}

function chatMessageFromSaved(message: SavedChatMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    ...(message.result ? { result: message.result } : {}),
    ...(message.closedConfirmation ? { closedConfirmation: true } : {}),
  };
}

/** A restored conversation is context, never renewed permission for a historical action. */
function closeChatConfirmations(conversation: ChatConversation): ChatConversation {
  return {
    ...conversation,
    history: conversation.history.map((turn) => {
      const closed = { ...turn };
      delete closed.confirmation;
      return closed;
    }),
    messages: conversation.messages.map((message) =>
      message.result?.confirmation
        ? {
            ...message,
            closedConfirmation: true,
            result: { ...message.result, confirmation: null },
          }
        : message,
    ),
  };
}

export type ChatSessionAction =
  | { type: "saved-list"; conversations: SavedChatConversation[] }
  | { type: "saved-messages"; id: string; messages: SavedChatMessage[] }
  | { type: "new"; id: string }
  | { type: "restore"; id: string }
  | { type: "close-confirmations"; id: string }
  | { type: "draft"; id: string; draft: string }
  | { type: "receipt"; id: string; receipt: ChatReceiptSelection | null }
  | { type: "recovery"; id: string; recovery: ChatRecovery | null }
  | { type: "history"; id: string; history: AgentChatTurn[] }
  | { type: "message"; id: string; message: ChatMessage; at: string };

export function reduceChatSession(
  state: ChatSessionState,
  action: ChatSessionAction,
): ChatSessionState {
  if (action.type === "saved-list") {
    const known = new Set(state.conversations.map((conversation) => conversation.id));
    return {
      ...state,
      listed: true,
      conversations: [
        ...state.conversations,
        ...action.conversations
          .filter((saved) => !known.has(saved.id))
          .map(
            (saved): ChatConversation => ({
              ...emptyChat(saved.id),
              title: saved.title,
              updatedAt: saved.updatedAt,
              loaded: false,
              messageCount: saved.messageCount,
            }),
          ),
      ],
    };
  }
  if (action.type === "new") {
    const conversations = state.conversations.map(closeChatConfirmations);
    const empty = conversations.find(
      (conversation) =>
        conversation.loaded &&
        conversation.messages.length === 0 &&
        !conversation.draft.trim() &&
        !conversation.receipt &&
        !conversation.recovery,
    );
    return {
      ...state,
      activeId: empty?.id ?? action.id,
      conversations: empty ? conversations : [emptyChat(action.id), ...conversations],
    };
  }
  if (action.type === "restore") {
    if (state.activeId === action.id) return state;
    if (!state.conversations.some((conversation) => conversation.id === action.id)) return state;
    return {
      ...state,
      activeId: action.id,
      conversations: state.conversations.map(closeChatConfirmations),
    };
  }
  return {
    ...state,
    conversations: state.conversations.map((conversation) => {
      if (conversation.id !== action.id) return conversation;
      if (action.type === "saved-messages") {
        // Messages sent in this tab are newer than anything fetched, so they win.
        if (conversation.loaded) return conversation;
        return {
          ...conversation,
          loaded: true,
          messages: action.messages.map(chatMessageFromSaved),
          history: historyFromSaved(action.messages),
        };
      }
      if (action.type === "close-confirmations") return closeChatConfirmations(conversation);
      if (action.type === "history") return { ...conversation, history: action.history };
      if (action.type === "draft") return { ...conversation, draft: action.draft };
      if (action.type === "receipt") return { ...conversation, receipt: action.receipt };
      if (action.type === "recovery") return { ...conversation, recovery: action.recovery };
      return {
        ...conversation,
        title:
          conversation.messages.length === 0 && action.message.role === "user"
            ? action.message.text.trim().slice(0, 55) || "Receipt"
            : conversation.title,
        messages: [...conversation.messages, action.message],
        updatedAt: action.at,
      };
    }),
  };
}
