import { gmailConnectionListSchema, startGmailConnectionResultSchema } from "@monara/contracts";
import type { NextRequest } from "next/server";
import { gmailCallbackUrl } from "@/lib/gmail/callback";
import {
  errorResponse,
  gmailConnectionService,
  gmailErrorResponse,
  noStoreHeaders,
  unauthenticated,
} from "@/lib/gmail/service";
import { isSameOriginRequest } from "@/lib/http/origin";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

/** Lists the signed-in User's Gmail Connections. */
export async function GET() {
  const identity = await getAuthenticatedIdentity();
  if (!identity) return unauthenticated();
  try {
    const connections = await gmailConnectionService().list(identity.id);
    return Response.json(gmailConnectionListSchema.parse({ connections }), {
      headers: noStoreHeaders,
    });
  } catch (error) {
    return gmailErrorResponse(error);
  }
}

/** Starts a Gmail Connection and returns Composio's consent URL. */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("FORBIDDEN", "This request must come from Monara.");
  }
  const identity = await getAuthenticatedIdentity();
  if (!identity) return unauthenticated();
  try {
    const callbackUrl = gmailCallbackUrl(request);
    if (!callbackUrl) {
      return errorResponse(
        "VALIDATION_FAILED",
        "Open Monara through your configured HTTPS tunnel and sign in there before connecting Gmail.",
      );
    }
    const result = await gmailConnectionService().start(identity.id, callbackUrl);
    return Response.json(startGmailConnectionResultSchema.parse(result), {
      headers: noStoreHeaders,
    });
  } catch (error) {
    return gmailErrorResponse(error);
  }
}
