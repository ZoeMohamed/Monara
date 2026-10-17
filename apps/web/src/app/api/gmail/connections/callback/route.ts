import { GmailConnectionError } from "@monara/core";
import type { NextRequest } from "next/server";
import { startDiscoveryAfterResponse } from "@/lib/gmail/discovery";
import { gmailConnectionService } from "@/lib/gmail/service";
import { browserOrigin } from "@/lib/http/origin";
import { ONBOARDING_RETURN_COOKIE, returnsToOnboarding } from "@/lib/onboarding/flow";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

const RESULT_PAGE = "/connections/gmail";

/** Discovery runs after the redirect, inside this route's time limit. */
export const maxDuration = 60;

/**
 * Composio's callback identity verifier. Composio redirects here with a
 * single-use session_uri after Google consent, and holds the connection until
 * this server confirms which signed-in User came back. Setup that started the
 * connection returns to Home, where it carries on; anything else lands on the
 * Gmail connections page.
 */
export async function GET(request: NextRequest) {
  const fromSetup = returnsToOnboarding(request.headers.get("cookie"));
  const finish = (result: string) => {
    const target = new URL(fromSetup ? "/" : RESULT_PAGE, browserOrigin(request));
    target.searchParams.set(fromSetup ? "gmail" : "result", result);
    const headers = new Headers({
      Location: target.toString(),
      "Cache-Control": "private, no-store",
    });
    // The marker is single use, so a later connection from Profile is not redirected here.
    if (fromSetup) headers.append("Set-Cookie", `${ONBOARDING_RETURN_COOKIE}=; Path=/; Max-Age=0`);
    return new Response(null, { status: 303, headers });
  };

  const identity = await getAuthenticatedIdentity();
  if (!identity) return finish("UNAUTHENTICATED");

  // Without a session_uri the Composio project has no verifier URL set, so the
  // returning User cannot be confirmed. Fail rather than trust query parameters.
  const sessionUri = request.nextUrl.searchParams.get("session_uri");
  if (!sessionUri) return finish("VALIDATION_FAILED");

  try {
    const connection = await gmailConnectionService().complete(identity.id, sessionUri);
    // Runs after the redirect; the detect step starts it again if it fails or stalls.
    startDiscoveryAfterResponse(connection.id);
    return finish("connected");
  } catch (error) {
    return finish(error instanceof GmailConnectionError ? error.code : "DEPENDENCY_UNAVAILABLE");
  }
}
