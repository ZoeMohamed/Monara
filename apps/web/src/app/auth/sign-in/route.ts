import { type NextRequest, NextResponse } from "next/server";

import { safeNextPath } from "@/lib/auth/redirect";
import { browserOrigin } from "@/lib/http/origin";
import { publicSupabaseConfig } from "@/lib/supabase/config";
import { isGoogleSignInAvailable } from "@/lib/supabase/provider";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function errorResponse(request: NextRequest, next = "/") {
  const destination = new URL("/sign-in", request.url);
  destination.searchParams.set("error", "oauth_start_failed");
  destination.searchParams.set("next", next);
  const response = new NextResponse(null, {
    headers: { Location: `${destination.pathname}${destination.search}` },
    status: 303,
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const requestedNext = formData.get("next");
    const next = safeNextPath(typeof requestedNext === "string" ? requestedNext : null);

    if (!(await isGoogleSignInAvailable(publicSupabaseConfig()))) {
      return errorResponse(request, next);
    }

    const callback = new URL("/auth/callback", browserOrigin(request));
    callback.searchParams.set("next", next);

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callback.toString(),
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });

    if (error || !data.url) return errorResponse(request, next);

    const providerUrl = new URL(data.url);
    const localHttp =
      providerUrl.protocol === "http:" && ["127.0.0.1", "localhost"].includes(providerUrl.hostname);
    if (providerUrl.protocol !== "https:" && !localHttp) {
      return errorResponse(request, next);
    }

    const response = NextResponse.redirect(providerUrl, 303);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    return errorResponse(request);
  }
}
