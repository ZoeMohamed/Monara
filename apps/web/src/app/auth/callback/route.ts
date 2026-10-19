import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { DELETION_COOKIE } from "@/lib/auth/deletion-receipt";

import { identityFromVerifiedClaims } from "@/lib/auth/identity";
import { safeNextPath } from "@/lib/auth/redirect";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function redirectWithNoStore(destination: string) {
  const response = new NextResponse(null, { headers: { Location: destination }, status: 303 });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function callbackError(request: NextRequest, code: "oauth_callback_failed" | "session_invalid") {
  const destination = new URL("/sign-in", request.url);
  destination.searchParams.set("error", code);
  destination.searchParams.set("next", safeNextPath(request.nextUrl.searchParams.get("next")));
  return redirectWithNoStore(`${destination.pathname}${destination.search}`);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const providerError = request.nextUrl.searchParams.get("error");
  if (!code || providerError) return callbackError(request, "oauth_callback_failed");

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return callbackError(request, "oauth_callback_failed");

    const { data, error: claimsError } = await supabase.auth.getClaims();
    if (claimsError || !identityFromVerifiedClaims(data?.claims)) {
      await supabase.auth.signOut({ scope: "local" });
      return callbackError(request, "session_invalid");
    }
    const active = await supabase.rpc("monara_session_is_active");
    if (active.error) return callbackError(request, "oauth_callback_failed");
    if (!active.data) {
      await supabase.auth.signOut({ scope: "local" });
      return callbackError(request, "session_invalid");
    }
    (await cookies()).delete(DELETION_COOKIE);

    return redirectWithNoStore(safeNextPath(request.nextUrl.searchParams.get("next")));
  } catch {
    return callbackError(request, "oauth_callback_failed");
  }
}
