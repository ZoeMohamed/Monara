// Farrel implements this adapter using Kapso. Resolve the linked User before
// using a conversation and validate provider webhooks in the runtime.
export interface WhatsAppTransport {
  sendText(input: { conversationId: string; text: string }): Promise<{ messageId: string }>;
}
