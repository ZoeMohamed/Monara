import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Keep the response generic and never expose provider or token details.
  }

  const response = new NextResponse(null, { headers: { Location: "/sign-in" }, status: 303 });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
