import {
  gmailConnectionIdSchema,
  gmailSyncCountsSchema,
  gmailSyncResultSchema,
} from "@monara/contracts";
import type { NextRequest } from "next/server";
import { AgentSyncError, requestAgentSync } from "@/lib/gmail/agent-sync";
import {
  errorResponse,
  gmailConnectionService,
  gmailErrorResponse,
  gmailIngestionRepository,
  noStoreHeaders,
  unauthenticated,
} from "@/lib/gmail/service";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

type Context = RouteContext<"/api/gmail/connections/[connectionId]/sync">;

async function readConnectionId(context: Context) {
  const parsed = gmailConnectionIdSchema.safeParse((await context.params).connectionId);
  return parsed.success ? parsed.data : null;
}

/** Imported, skipped, and failed counts for one of the signed-in User's connections. */
export async function GET(_request: NextRequest, context: Context) {
  const identity = await getAuthenticatedIdentity();
  if (!identity) return unauthenticated();
  const connectionId = await readConnectionId(context);
  if (!connectionId) return errorResponse("VALIDATION_FAILED", "Invalid Gmail connection id.");

  try {
    const counts = await gmailIngestionRepository().syncCounts(identity.id, connectionId);
    return Response.json(gmailSyncCountsSchema.parse(counts), { headers: noStoreHeaders });
  } catch (error) {
    return gmailErrorResponse(error);
  }
}

/** Sync Now: queues a background sync of one of the signed-in User's active connections. */
export async function POST(_request: NextRequest, context: Context) {
  const identity = await getAuthenticatedIdentity();
  if (!identity) return unauthenticated();
  const connectionId = await readConnectionId(context);
  if (!connectionId) return errorResponse("VALIDATION_FAILED", "Invalid Gmail connection id.");

  try {
    // Ownership and status come from the User's own list, never from the request.
    const connections = await gmailConnectionService().list(identity.id);
    const connection = connections.find((candidate) => candidate.id === connectionId);
    if (!connection) return errorResponse("NOT_FOUND", "That Gmail connection was not found.");
    if (connection.status !== "active") {
      return errorResponse("CONFLICT", "Reconnect this Gmail account before syncing.");
    }

    // Read counts first: once the sync is queued, nothing after it may fail and invite a retry.
    const counts = await gmailIngestionRepository().syncCounts(identity.id, connectionId);
    await requestAgentSync(connectionId);
    return Response.json(gmailSyncResultSchema.parse({ status: "queued", counts }), {
      headers: noStoreHeaders,
      status: 202,
    });
  } catch (error) {
    if (error instanceof AgentSyncError) {
      return errorResponse("DEPENDENCY_UNAVAILABLE", "Gmail sync is unavailable right now.");
    }
    return gmailErrorResponse(error);
  }
}
