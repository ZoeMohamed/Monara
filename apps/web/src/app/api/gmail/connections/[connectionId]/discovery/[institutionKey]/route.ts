import { dismissGmailDiscoveryInputSchema } from "@monara/contracts";
import type { NextRequest } from "next/server";
import {
  errorResponse,
  gmailErrorResponse,
  gmailIngestionRepository,
  noStoreHeaders,
  unauthenticated,
} from "@/lib/gmail/service";
import { isSameOriginRequest } from "@/lib/http/origin";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

type Context = RouteContext<"/api/gmail/connections/[connectionId]/discovery/[institutionKey]">;

/** Dismisses a newly found bank, card, or wallet so it stops showing as new. */
export async function PATCH(request: NextRequest, context: Context) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("FORBIDDEN", "This request must come from Monara.");
  }
  const identity = await getAuthenticatedIdentity();
  if (!identity) return unauthenticated();
  const params = await context.params;
  const input = dismissGmailDiscoveryInputSchema.safeParse({
    connectionId: params.connectionId,
    institutionKey: params.institutionKey,
  });
  if (!input.success) return errorResponse("VALIDATION_FAILED", "Invalid account suggestion.");

  try {
    // Scoped to the signed-in User, so another User's connection is simply not found.
    const dismissed = await gmailIngestionRepository().dismissDiscovery(
      identity.id,
      input.data.connectionId,
      input.data.institutionKey,
    );
    if (!dismissed) return errorResponse("NOT_FOUND", "That account suggestion was not found.");
    return new Response(null, { status: 204, headers: noStoreHeaders });
  } catch (error) {
    return gmailErrorResponse(error);
  }
}
