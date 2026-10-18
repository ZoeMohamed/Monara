import { agentChatResponseSchema } from "@monara/contracts";
import type { MonaraServiceRoleClient } from "@monara/db";
import type { ChatHistoryRepository } from "./chat-history.ts";
import { FinanceOperationError } from "./finance.ts";

function fail(message: string, error?: { code?: string } | null): never {
  // 23503: the conversation id exists but belongs to another User.
  if (error?.code === "23503") {
    throw new FinanceOperationError("FORBIDDEN", "That chat belongs to another account.");
  }
  throw new FinanceOperationError("INTERNAL", message);
}

/**
 * chat_conversations and chat_messages through the service-role client, the only way to
 * reach them: signed-in browsers have no access. Callers must already have verified the User.
 */
export function createSupabaseChatHistoryRepository(
  client: MonaraServiceRoleClient,
): ChatHistoryRepository {
  return {
    async appendExchange(input) {
      const { error } = await client.rpc("append_chat_exchange", {
        p_user_id: input.userId,
        p_conversation_id: input.conversationId,
        p_title: input.title,
        p_user_text: input.userText,
        p_agent_text: input.agentText,
        p_agent_result: input.agentResult,
        p_closed_confirmation: input.closedConfirmation,
      });
      if (error) fail("The chat could not be saved.", error);
    },

    async listConversations(userId, limit) {
      const { data, error } = await client
        .from("chat_conversations")
        .select("id, title, updated_at, chat_messages(count)")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit);
      if (error) fail("Your chats could not be read.");
      return data.map((row) => ({
        id: row.id,
        title: row.title,
        updatedAt: row.updated_at,
        messageCount: row.chat_messages[0]?.count ?? 0,
      }));
    },

    async listMessages(userId, conversationId, limit) {
      const { data, error } = await client
        .from("chat_messages")
        .select("id, role, text, result, closed_confirmation")
        .eq("user_id", userId)
        .eq("conversation_id", conversationId)
        .order("seq", { ascending: false })
        .limit(limit);
      if (error) fail("This chat could not be read.");
      return [...data].reverse().map((row) => {
        const result = agentChatResponseSchema.safeParse(row.result);
        return {
          id: row.id,
          role: row.role === "user" ? "user" : "agent",
          text: row.text,
          // A row that no longer matches the contract still shows its text.
          result: result.success ? result.data : null,
          closedConfirmation: row.closed_confirmation,
        };
      });
    },
  };
}
