import { GmailConnectionError } from "@monara/core";
import type { NextRequest } from "next/server";
import { gmailConnectionService } from "@/lib/gmail/service";
import { browserOrigin } from "@/lib/http/origin";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

const RESULT_PAGE = "/connections/gmail";

/**
 * Composio's callback identity verifier. Composio redirects here with a
 * single-use session_uri after Google consent, and holds the connection until
 * this server confirms which signed-in User came back.
 */
export async function GET(request: NextRequest) {
  const finish = (result: string) => {
    const target = new URL(RESULT_PAGE, browserOrigin(request));
    target.searchParams.set("result", result);
    return Response.redirect(target, 303);
  };

  const identity = await getAuthenticatedIdentity();
  if (!identity) return finish("UNAUTHENTICATED");

  // Without a session_uri the Composio project has no verifier URL set, so the
  // returning User cannot be confirmed. Fail rather than trust query parameters.
  const sessionUri = request.nextUrl.searchParams.get("session_uri");
  if (!sessionUri) return finish("VALIDATION_FAILED");

  try {
    await gmailConnectionService().complete(identity.id, sessionUri);
    return finish("connected");
  } catch (error) {
    return finish(error instanceof GmailConnectionError ? error.code : "DEPENDENCY_UNAVAILABLE");
  }
}
