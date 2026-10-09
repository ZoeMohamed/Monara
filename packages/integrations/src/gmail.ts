// Adlyn implements this adapter using Composio. Connections must already be
// verified as belonging to the User before an adapter receives them.
export interface GmailConnector {
  readMessage(input: {
    connectionId: string;
    messageId: string;
  }): Promise<{ text: string; html?: string }>;
}
