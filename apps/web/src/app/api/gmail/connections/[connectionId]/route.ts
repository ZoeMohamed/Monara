import { disconnectGmailConnectionInputSchema } from "@monara/contracts";
import { after, type NextRequest } from "next/server";
import {
  errorResponse,
  gmailConnectionService,
  gmailErrorResponse,
  noStoreHeaders,
  unauthenticated,
} from "@/lib/gmail/service";
import { removeMailboxTrigger } from "@/lib/gmail/trigger";
import { isSameOriginRequest } from "@/lib/http/origin";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

/** Disconnects one of the signed-in User's Gmail Connections. */
export async function DELETE(
  request: NextRequest,
  context: RouteContext<"/api/gmail/connections/[connectionId]">,
) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("FORBIDDEN", "This request must come from Monara.");
  }
  const identity = await getAuthenticatedIdentity();
  if (!identity) return unauthenticated();

  const input = disconnectGmailConnectionInputSchema.safeParse(await context.params);
  if (!input.success) return errorResponse("VALIDATION_FAILED", "Invalid Gmail connection id.");

  try {
    await gmailConnectionService().disconnect(identity.id, input.data.connectionId);
    const { connectionId } = input.data;
    // Disconnecting already unlinked its accounts; its trigger has nothing left to watch.
    after(() => removeMailboxTrigger(connectionId).catch(() => undefined));
    return new Response(null, { headers: noStoreHeaders, status: 204 });
  } catch (error) {
    return gmailErrorResponse(error);
  }
}
