import {
  createKapsoTransport,
  KAPSO_MESSAGE_RECEIVED_EVENT,
  parseKapsoInboundMessages,
  verifyKapsoSignature,
} from "@monara/integrations";
import type { Env } from "../env.ts";

const LINK_PROMPT =
  "This WhatsApp number isn't linked to a Monara account yet. Open Monara, go to Settings, and link your WhatsApp number to chat with your Agent here.";

/**
 * Kapso webhook for inbound WhatsApp messages (F12).
 *
 * WhatsApp Links do not exist yet (AR6), so no number can be resolved to a User.
 * The handler fails closed: every sender is treated as unlinked, gets the prompt
 * to link, and nothing reaches the Agent or any record.
 */
export async function handleKapsoWebhook(request: Request, env: Env): Promise<Response> {
  const { KAPSO_API_KEY, KAPSO_WEBHOOK_SECRET } = env;
  if (!KAPSO_API_KEY || !KAPSO_WEBHOOK_SECRET) {
    return Response.json({ error: "The WhatsApp channel is not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("X-Webhook-Signature");
  if (!(await verifyKapsoSignature({ rawBody, signature, secret: KAPSO_WEBHOOK_SECRET }))) {
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }
  if (request.headers.get("X-Webhook-Event") !== KAPSO_MESSAGE_RECEIVED_EVENT) {
    return Response.json({ ok: true, handled: 0 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  // One prompt per sender, however many messages Kapso buffered into this delivery.
  const senders = new Map<string, string>();
  for (const message of parseKapsoInboundMessages(payload)) {
    senders.set(message.from, message.phoneNumberId);
  }
  try {
    for (const [to, phoneNumberId] of senders) {
      const transport = createKapsoTransport({ apiKey: KAPSO_API_KEY, phoneNumberId });
      await transport.sendText({ to, text: LINK_PROMPT });
    }
  } catch {
    // A non-200 makes Kapso redeliver, which is what we want when the reply did not go out.
    return Response.json({ error: "The reply could not be sent." }, { status: 502 });
  }
  return Response.json({ ok: true, handled: senders.size });
}
