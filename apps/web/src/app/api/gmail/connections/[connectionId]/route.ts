import { disconnectGmailConnectionInputSchema } from "@monara/contracts";
import type { NextRequest } from "next/server";
import {
  errorResponse,
  gmailConnectionService,
  gmailErrorResponse,
  noStoreHeaders,
  unauthenticated,
} from "@/lib/gmail/service";
import { getSignedInUserId } from "@/lib/supabase/session";

/** Disconnects one of the signed-in User's Gmail Connections. */
export async function DELETE(
  _request: NextRequest,
  context: RouteContext<"/api/gmail/connections/[connectionId]">,
) {
  const userId = await getSignedInUserId();
  if (!userId) return unauthenticated();

  const input = disconnectGmailConnectionInputSchema.safeParse(await context.params);
  if (!input.success) return errorResponse("VALIDATION_FAILED", "Invalid Gmail connection id.");

  try {
    await gmailConnectionService().disconnect(userId, input.data.connectionId);
    return new Response(null, { headers: noStoreHeaders, status: 204 });
  } catch (error) {
    return gmailErrorResponse(error);
  }
}
