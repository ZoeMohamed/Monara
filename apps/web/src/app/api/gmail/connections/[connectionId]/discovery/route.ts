import { gmailConnectionIdSchema, gmailDiscoverySchema } from "@monara/contracts";
import { GmailIngestionError } from "@monara/core";
import type { NextRequest } from "next/server";
import { rerunDiscoveryIfNeeded, runDiscovery } from "@/lib/gmail/discovery";
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

/** Discovery runs inline here and reads a few hundred message headers at most. */
export const maxDuration = 60;

async function readConnectionId(context: Context) {
  const parsed = gmailConnectionIdSchema.safeParse((await context.params).connectionId);
  return parsed.success ? parsed.data : null;
}

/**
 * Banks, cards, and wallets found in one of the signed-in User's mailboxes. When the
 * search never ran, failed, or stalled, it runs again here before answering.
 * Status-only reads during name entry leave the callback's background scan alone.
 */
export async function GET(request: NextRequest, context: Context) {
  const identity = await getAuthenticatedIdentity();
  if (!identity) return unauthenticated();
  const connectionId = await readConnectionId(context);
  if (!connectionId) return errorResponse("VALIDATION_FAILED", "Invalid Gmail connection id.");

  try {
    const repository = gmailIngestionRepository();
    // Ownership first: this answers NOT_FOUND for a connection that is not the User's.
    let discovery = await repository.discoveryFor(identity.id, connectionId);
    if (
      discovery.state !== "completed" &&
      new URL(request.url).searchParams.get("refresh") !== "false"
    ) {
      // An inactive connection has nothing to search; show what is stored.
      const ran = await rerunDiscoveryIfNeeded(connectionId).catch(() => false);
      if (ran) discovery = await repository.discoveryFor(identity.id, connectionId);
    }
    return Response.json(gmailDiscoverySchema.parse(discovery), { headers: noStoreHeaders });
  } catch (error) {
    return gmailErrorResponse(error);
  }
}

/** Looks for the User's banks, cards, and wallets again, and answers with what it found. */
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
    try {
      await runDiscovery(connectionId);
    } catch (error) {
      if (error instanceof GmailIngestionError && error.code === "NOT_FOUND") {
        return errorResponse("CONFLICT", "Reconnect this Gmail account first.");
      }
      return errorResponse("DEPENDENCY_UNAVAILABLE", "Your inbox could not be checked. Try again.");
    }
    const discovery = await gmailIngestionRepository().discoveryFor(identity.id, connectionId);
    return Response.json(gmailDiscoverySchema.parse(discovery), { headers: noStoreHeaders });
  } catch (error) {
    return gmailErrorResponse(error);
  }
}
