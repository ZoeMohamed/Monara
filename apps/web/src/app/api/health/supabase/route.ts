import { checkSupabaseConnectivity } from "@monara/db";
import { publicSupabaseConfig } from "@/lib/supabase/config";

const noStoreHeaders = { "Cache-Control": "no-store" };

/** Reports only public Supabase Auth reachability and never exposes provider details. */
export async function GET() {
  try {
    await checkSupabaseConnectivity(publicSupabaseConfig());
    return Response.json({ connected: true }, { headers: noStoreHeaders });
  } catch {
    return Response.json(
      { connected: false, code: "SUPABASE_UNAVAILABLE" },
      { headers: noStoreHeaders, status: 503 },
    );
  }
}
