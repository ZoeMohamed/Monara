// Web chat history. The in-app chat is saved on the server after the Agent answers, so a
// reload or a new device finds the conversation again. The browser never writes it.
import {
  type AgentChatResponse,
  agentChatResponseSchema,
  type ChatExchange,
  chatExchangeSchema,
  type SavedChatConversation,
  type SavedChatList,
  type SavedChatMessage,
  type SavedChatMessages,
  savedChatListLimit,
  savedChatListSchema,
  savedChatMessageLimit,
  savedChatMessagesSchema,
  userIdSchema,
} from "@monara/contracts";
import { z } from "zod";
import { FinanceOperationError } from "./finance.ts";

export interface ChatHistoryRepository {
  /** Saves a question and its answer together, creating the conversation on first use. */
  appendExchange(input: {
    userId: string;
    conversationId: string;
    exchangeId: string;
    createdAt: string;
    title: string;
    userText: string;
    agentText: string;
    agentResult: AgentChatResponse;
    closedConfirmation: boolean;
    signal?: AbortSignal;
  }): Promise<void>;
  /** The User's conversations, newest first. */
  listConversations(userId: string, limit: number): Promise<SavedChatConversation[]>;
  /** The newest messages of one of the User's conversations, oldest first. */
  listMessages(userId: string, conversationId: string, limit: number): Promise<SavedChatMessage[]>;
}

export interface ChatHistoryService {
  saveExchange(userId: string, exchange: ChatExchange, signal?: AbortSignal): Promise<void>;
  conversations(userId: string): Promise<SavedChatList>;
  messages(userId: string, conversationId: string): Promise<SavedChatMessages>;
}

const TITLE_LENGTH = 55;

/** The first message names the chat, on one line. */
function chatTitle(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, TITLE_LENGTH).trim() || "New chat";
}

export function createChatHistoryService(repository: ChatHistoryRepository): ChatHistoryService {
  return {
    async saveExchange(userId, input, signal) {
      const owner = userIdSchema.parse(userId);
      const { conversationId, exchangeId, createdAt, text, response } =
        chatExchangeSchema.parse(input);
      await repository.appendExchange({
        userId: owner,
        conversationId,
        exchangeId,
        createdAt,
        title: chatTitle(text),
        userText: text,
        agentText: response.reply,
        // A restored chat is context, never renewed permission: an open confirmation is
        // saved as closed, and a signed image link is dropped because it expires.
        agentResult: agentChatResponseSchema.parse({
          reply: response.reply,
          actions: response.actions,
          confirmation: null,
        }),
        closedConfirmation: response.confirmation !== null,
        signal,
      });
    },

    async conversations(userId) {
      const owner = userIdSchema.parse(userId);
      return savedChatListSchema.parse({
        conversations: await repository.listConversations(owner, savedChatListLimit),
      });
    },

    async messages(userId, conversationId) {
      const owner = userIdSchema.parse(userId);
      const id = z.uuid().safeParse(conversationId);
      if (!id.success) throw new FinanceOperationError("VALIDATION_FAILED", "Unknown chat.");
      return savedChatMessagesSchema.parse({
        messages: await repository.listMessages(owner, id.data, savedChatMessageLimit),
      });
    },
  };
}
