import { gmailConnectionListSchema, startGmailConnectionResultSchema } from "@monara/contracts";
import type { NextRequest } from "next/server";
import {
  browserOrigin,
  GMAIL_CALLBACK_PATH,
  gmailConnectionService,
  gmailErrorResponse,
  noStoreHeaders,
  unauthenticated,
} from "@/lib/gmail/service";
import { getSignedInUserId } from "@/lib/supabase/session";

/** Lists the signed-in User's Gmail Connections. */
export async function GET() {
  const userId = await getSignedInUserId();
  if (!userId) return unauthenticated();
  try {
    const connections = await gmailConnectionService().list(userId);
    return Response.json(gmailConnectionListSchema.parse({ connections }), {
      headers: noStoreHeaders,
    });
  } catch (error) {
    return gmailErrorResponse(error);
  }
}

/** Starts a Gmail Connection and returns Composio's consent URL. */
export async function POST(request: NextRequest) {
  const userId = await getSignedInUserId();
  if (!userId) return unauthenticated();
  try {
    const callbackUrl = new URL(GMAIL_CALLBACK_PATH, browserOrigin(request)).toString();
    const result = await gmailConnectionService().start(userId, callbackUrl);
    return Response.json(startGmailConnectionResultSchema.parse(result), {
      headers: noStoreHeaders,
    });
  } catch (error) {
    return gmailErrorResponse(error);
  }
}
