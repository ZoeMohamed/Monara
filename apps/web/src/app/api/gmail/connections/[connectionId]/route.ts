import { disconnectGmailConnectionInputSchema } from "@monara/contracts";
import type { NextRequest } from "next/server";
import {
  errorResponse,
  gmailConnectionService,
  gmailErrorResponse,
  noStoreHeaders,
  unauthenticated,
} from "@/lib/gmail/service";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

/** Disconnects one of the signed-in User's Gmail Connections. */
export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/gmail/connections/[connectionId]">,
) {
  const identity = await getAuthenticatedIdentity();
  if (!identity) return unauthenticated();

  const input = disconnectGmailConnectionInputSchema.safeParse(await context.params);
  if (!input.success) return errorResponse("VALIDATION_FAILED", "Invalid Gmail connection id.");

  try {
    await gmailConnectionService().disconnect(identity.id, input.data.connectionId);
    return new Response(null, { headers: noStoreHeaders, status: 204 });
  } catch (error) {
    return gmailErrorResponse(error);
  }
}
