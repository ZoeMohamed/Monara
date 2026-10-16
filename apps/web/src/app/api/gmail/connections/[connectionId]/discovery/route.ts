import { gmailConnectionIdSchema, gmailDiscoverySchema } from "@monara/contracts";
import type { NextRequest } from "next/server";
import { AgentSyncError, requestAgentDiscovery } from "@/lib/gmail/agent-sync";
import {
  errorResponse,
  gmailConnectionService,
  gmailErrorResponse,
  gmailIngestionRepository,
  noStoreHeaders,
  unauthenticated,
} from "@/lib/gmail/service";
import { isSameOriginRequest } from "@/lib/http/origin";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

type Context = RouteContext<"/api/gmail/connections/[connectionId]/discovery">;

async function readConnectionId(context: Context) {
  const parsed = gmailConnectionIdSchema.safeParse((await context.params).connectionId);
  return parsed.success ? parsed.data : null;
}

/** Banks, cards, and wallets found in one of the signed-in User's mailboxes. */
export async function GET(_request: NextRequest, context: Context) {
  const identity = await getAuthenticatedIdentity();
  if (!identity) return unauthenticated();
  const connectionId = await readConnectionId(context);
  if (!connectionId) return errorResponse("VALIDATION_FAILED", "Invalid Gmail connection id.");

  try {
    const discovery = await gmailIngestionRepository().discoveryFor(identity.id, connectionId);
    return Response.json(gmailDiscoverySchema.parse(discovery), { headers: noStoreHeaders });
  } catch (error) {
    return gmailErrorResponse(error);
  }
}

/** Looks for the User's banks, cards, and wallets again. */
export async function POST(request: NextRequest, context: Context) {
  if (!isSameOriginRequest(request)) {
    return errorResponse("FORBIDDEN", "This request must come from Monara.");
  }
  const identity = await getAuthenticatedIdentity();
  if (!identity) return unauthenticated();
  const connectionId = await readConnectionId(context);
  if (!connectionId) return errorResponse("VALIDATION_FAILED", "Invalid Gmail connection id.");

  try {
    // Ownership and status come from the User's own list, never from the request.
    const connection = (await gmailConnectionService().list(identity.id)).find(
      (candidate) => candidate.id === connectionId,
    );
    if (!connection) return errorResponse("NOT_FOUND", "That Gmail connection was not found.");
    if (connection.status !== "active") {
      return errorResponse("CONFLICT", "Reconnect this Gmail account first.");
    }
    await requestAgentDiscovery(connectionId);
    return Response.json({ status: "queued" }, { headers: noStoreHeaders, status: 202 });
  } catch (error) {
    if (error instanceof AgentSyncError) {
      return errorResponse("DEPENDENCY_UNAVAILABLE", "Account discovery is unavailable right now.");
    }
    return gmailErrorResponse(error);
  }
}
