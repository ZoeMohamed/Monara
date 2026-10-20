import { type NextRequest, NextResponse } from "next/server";

import { identityFromVerifiedClaims } from "@/lib/auth/identity";
import { safeAuthenticatedNextPath, safeNextPath } from "@/lib/auth/redirect";
import { isSameOriginRequest } from "@/lib/http/origin";
import { availablePublicSupabaseConfig } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const maxFieldLength = 256;

function redirectTo(path: string) {
  const response = new NextResponse(null, { headers: { Location: path }, status: 303 });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function failure(code: "password_invalid" | "password_unavailable", next: string) {
  const query = new URLSearchParams({ error: code, next });
  return redirectTo(`/sign-in?${query.toString()}`);
}

/**
 * Password sign-in exists for the shared reviewer account only. Any other account that
 * signs in this way is signed straight back out, so it cannot reach the product, and
 * every rejection shows the same message so the form cannot be used to probe for emails.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  const requestedNext = formData?.get("next");
  const next = safeNextPath(typeof requestedNext === "string" ? requestedNext : null);
  if (!formData || !isSameOriginRequest(request)) return failure("password_invalid", next);

  const email = formData.get("email");
  const password = formData.get("password");
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    email.length === 0 ||
    password.length === 0 ||
    email.length > maxFieldLength ||
    password.length > maxFieldLength
  ) {
    return failure("password_invalid", next);
  }

  try {
    const config = availablePublicSupabaseConfig();
    if (!config) return failure("password_unavailable", next);
    const supabase = await createServerSupabaseClient(config);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error || !data.session) return failure("password_invalid", next);

    const claims = await supabase.auth.getClaims();
    const identity = claims.error ? null : identityFromVerifiedClaims(claims.data?.claims);
    if (!identity?.demoAccount) {
      await supabase.auth.signOut();
      return failure("password_invalid", next);
    }
    return redirectTo(safeAuthenticatedNextPath(next));
  } catch {
    return failure("password_unavailable", next);
  }
}
