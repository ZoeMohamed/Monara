import { setupKeyForUser } from "@/lib/auth/setup-key";
import { getAuthenticatedIdentity } from "@/lib/supabase/server";

export async function GET() {
  const identity = await getAuthenticatedIdentity();
  return Response.json(
    { setupKey: identity ? setupKeyForUser(identity.id) : null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
