import { isGmailIngestionOperation, runGmailIngestionOperation } from "@monara/core";
import type { NextRequest } from "next/server";
import { hasAgentCredential } from "@/lib/agent/credential";
import {
  errorResponse,
  gmailErrorResponse,
  gmailIngestionRepository,
  noStoreHeaders,
} from "@/lib/gmail/service";

export const runtime = "nodejs";

/**
 * Gmail ingestion operations for the agent worker (packages/contracts/src/gmail-extraction.ts).
 * These are system jobs with no signed-in User or Channel, so they live apart from the
 * per-User finance operations. Ownership always comes from the stored connection.
 * A connection that is not active answers 404 NOT_FOUND, which tells the worker to stop.
 */
export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/agent/gmail/[operation]">,
) {
  if (!hasAgentCredential(request)) {
    return errorResponse("UNAUTHENTICATED", "Not authorized.");
  }
  const { operation } = await context.params;
  // Not NOT_FOUND: the worker reads that as an inactive connection and drops the job.
  if (!isGmailIngestionOperation(operation)) {
    return errorResponse("VALIDATION_FAILED", "That operation does not exist.");
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return errorResponse("VALIDATION_FAILED", "The request is not valid.");
  }

  try {
    const result = await runGmailIngestionOperation(gmailIngestionRepository(), operation, input);
    return Response.json(result, { headers: noStoreHeaders });
  } catch (error) {
    return gmailErrorResponse(error);
  }
}
