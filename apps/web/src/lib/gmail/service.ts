import type { OperationErrorCode } from "@monara/contracts";
import {
  createGmailConnectionService,
  createSupabaseGmailConnectionRepository,
  createSupabaseGmailIngestionRepository,
  GmailConnectionError,
  GmailIngestionError,
} from "@monara/core";
import { createMonaraServiceRoleClient } from "@monara/db";
import { createComposioGmailClient } from "@monara/integrations";
import { publicSupabaseConfig } from "@/lib/supabase/config";

/** Builds the service from server-only configuration; missing values fail closed. */
export function gmailConnectionService() {
  return createGmailConnectionService({
    repository: createSupabaseGmailConnectionRepository(
      createMonaraServiceRoleClient(publicSupabaseConfig(), process.env.SUPABASE_SERVICE_ROLE_KEY),
    ),
    provider: createComposioGmailClient({
      apiUrl: process.env.COMPOSIO_API_URL ?? "",
      apiKey: process.env.COMPOSIO_API_KEY ?? "",
      authConfigId: process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID ?? "",
    }),
  });
}

/**
 * Gmail ingestion storage for the agent worker and Gmail imports. Callers must first
 * authenticate the agent, or scope every call to the signed-in User.
 */
export function gmailIngestionRepository() {
  return createSupabaseGmailIngestionRepository(
    createMonaraServiceRoleClient(publicSupabaseConfig(), process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
}

const STATUS: Record<OperationErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  DEPENDENCY_UNAVAILABLE: 503,
};

export const noStoreHeaders = { "Cache-Control": "no-store" };

export function errorResponse(code: OperationErrorCode, message: string) {
  return Response.json(
    { code, message, requestId: null },
    { headers: noStoreHeaders, status: STATUS[code] },
  );
}

export const unauthenticated = () => errorResponse("UNAUTHENTICATED", "Sign in to continue.");

/** Maps service errors to their status; anything else hides its details. */
export function gmailErrorResponse(error: unknown) {
  if (error instanceof GmailConnectionError || error instanceof GmailIngestionError) {
    return errorResponse(error.code, error.message);
  }
  return errorResponse("DEPENDENCY_UNAVAILABLE", "Gmail connections are unavailable right now.");
}
