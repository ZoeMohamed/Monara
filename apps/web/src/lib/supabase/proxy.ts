import { createMonaraServerClient } from "@monara/db";
import { type NextRequest, NextResponse } from "next/server";

import { publicSupabaseConfig } from "@/lib/supabase/config";

/** Refreshes an SSR Auth session once and forwards every updated cookie and cache header. */
export async function refreshSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createMonaraServerClient(publicSupabaseConfig(), {
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet, headers) => {
      for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
      response = NextResponse.next({ request });
      for (const { name, value, options } of cookiesToSet) {
        response.cookies.set(name, value, options);
      }
      for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    },
  });

  await supabase.auth.getClaims();
  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");
  return response;
}
