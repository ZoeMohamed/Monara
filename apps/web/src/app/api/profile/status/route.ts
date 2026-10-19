import { setupKeyForUser } from "@/lib/auth/setup-key";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

export async function GET() {
  try {
    const identity = await getAuthenticatedIdentity();
    return Response.json(
      { setupKey: identity ? setupKeyForUser(identity.id) : null },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      { message: "Session status is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
