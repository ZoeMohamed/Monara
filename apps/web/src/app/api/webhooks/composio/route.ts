import {
  GMAIL_NEW_MESSAGE_TRIGGER,
  parseComposioGmailEvent,
  verifyComposioWebhook,
} from "@monara/integrations";
import { requestAgentIngest } from "@/lib/gmail/agent-sync";
import { errorResponse, gmailIngestionRepository, noStoreHeaders } from "@/lib/gmail/service";

export const runtime = "nodejs";

const ignored = () => new Response(null, { headers: noStoreHeaders, status: 204 });

/**
 * Composio's new-mail trigger for a mailbox's linked bank senders. Only a correctly
 * signed event is read; the mailbox comes from our own record of the Composio account,
 * never from the event, and the agent re-reads the message itself before parsing.
 * Events for other triggers or for mailboxes that are no longer active are ignored.
 * Payloads are never logged.
 */
export async function POST(request: Request) {
  const body = await request.text();
  const verified = await verifyComposioWebhook({
    secret: process.env.COMPOSIO_WEBHOOK_SECRET,
    id: request.headers.get("webhook-id"),
    timestamp: request.headers.get("webhook-timestamp"),
    signature: request.headers.get("webhook-signature"),
    body,
  });
  if (!verified) return errorResponse("UNAUTHENTICATED", "Not authorized.");

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return errorResponse("VALIDATION_FAILED", "The event is not valid.");
  }
  const event = parseComposioGmailEvent(payload);
  if (!event || event.triggerSlug !== GMAIL_NEW_MESSAGE_TRIGGER) return ignored();

  try {
    const connectionId = await gmailIngestionRepository().connectionForComposioAccount(
      event.connectedAccountId,
    );
    if (!connectionId) return ignored();
    await requestAgentIngest({
      connectionId,
      reason: "trigger",
      messageIds: [event.gmailMessageId],
      tracksSync: false,
    });
    return new Response(null, { headers: noStoreHeaders, status: 202 });
  } catch {
    // Composio retries a failed delivery; the daily cron catches anything still missed.
    return errorResponse("DEPENDENCY_UNAVAILABLE", "The event could not be queued.");
  }
}
