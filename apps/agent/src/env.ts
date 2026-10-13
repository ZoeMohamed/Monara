import type { WhatsAppConversation } from "./whatsapp/conversation.ts";

// Every value is optional at the type level so each handler has to check what it
// needs and fail closed when it is missing.
export interface Env {
  /** One Durable Object per User for their WhatsApp conversation. */
  CONVERSATIONS?: DurableObjectNamespace<WhatsAppConversation>;
  MONARA_BACKEND_URL?: string;
  MONARA_AGENT_BACKEND_SECRET?: string;
  COMPOSIO_API_KEY?: string;
  KAPSO_API_KEY?: string;
  KAPSO_WEBHOOK_SECRET?: string;
  LLM_BASE_URL?: string;
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
}
