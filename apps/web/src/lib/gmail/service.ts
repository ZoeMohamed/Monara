import type { OperationErrorCode } from "@monara/contracts";
import {
  createGmailConnectionService,
  createSupabaseGmailConnectionRepository,
  GmailConnectionError,
} from "@monara/core";
import { createMonaraServiceRoleClient } from "@monara/db";
import { createComposioGmailClient } from "@monara/integrations";
import type { NextRequest } from "next/server";
import { publicSupabaseConfig } from "@/lib/supabase/config";

export const GMAIL_CALLBACK_PATH = "/api/gmail/connections/callback";

/**
 * The origin the browser used. `next dev --hostname 0.0.0.0` reports the bind
 * address in nextUrl, which browsers block and which never carries the session
 * cookie, so prefer the forwarded or Host header.
 */
export function browserOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return request.nextUrl.origin;
  const protocol = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol;
  return `${protocol.replace(/:$/, "")}://${host}`;
}

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
  if (error instanceof GmailConnectionError) return errorResponse(error.code, error.message);
  return errorResponse("DEPENDENCY_UNAVAILABLE", "Gmail connections are unavailable right now.");
}
