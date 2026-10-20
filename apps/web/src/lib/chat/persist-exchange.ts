import type { ChatExchange, WebChatBridgeResponse, WebChatResponse } from "@monara/contracts";
import { issueChatHistoryRecovery } from "./history-recovery.ts";

type SaveExchange = (userId: string, exchange: ChatExchange, signal: AbortSignal) => Promise<void>;

/** A history outage must preserve the verified answer and never invite an Agent replay. */
export async function persistChatExchange(
  userId: string,
  request: { conversationId: string; text: string },
  response: WebChatResponse,
  secret: string,
  save: SaveExchange,
): Promise<WebChatBridgeResponse> {
  const exchange = {
    conversationId: request.conversationId,
    text: request.text,
    response,
    exchangeId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  // Prepare the recovery receipt before storage. A timeout may mean the commit succeeded.
  let recovery: ReturnType<typeof issueChatHistoryRecovery>;
  try {
    recovery = issueChatHistoryRecovery(userId, exchange, secret);
  } catch {
    // Preserve the verified answer if its bounded retry receipt cannot be issued.
    // The client must not replay the Agent to recover chat history.
    return { ...response, historySave: { status: "unavailable", exchangeId: exchange.exchangeId } };
  }
  try {
    await save(userId, exchange, AbortSignal.timeout(5_000));
    return { ...response, historySave: { status: "saved", exchangeId: exchange.exchangeId } };
  } catch {
    return { ...response, historySave: recovery };
  }
}
