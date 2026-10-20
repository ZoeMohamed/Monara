import { recoverTransactionFx } from "@monara/core";
import { createMonaraServiceRoleClient } from "@monara/db";
import { hasAgentCredential } from "@/lib/agent/credential";
import { evaluateConfirmedGmailImports } from "@/lib/finance/service";
import { publicSupabaseConfig } from "@/lib/supabase/config";

export const runtime = "nodejs";
export const maxDuration = 30;

/** The existing minute scheduler drains at most ten durable conversion attempts. */
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!hasAgentCredential(request))
    return Response.json({ error: "Not authorized." }, { status: 401, headers });
  try {
    const client = createMonaraServiceRoleClient(
      publicSupabaseConfig(),
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
    const result = await recoverTransactionFx(client);
    const byUser = new Map<string, string[]>();
    for (const item of result.confirmed) {
      const ids = byUser.get(item.userId) ?? [];
      ids.push(item.transactionId);
      byUser.set(item.userId, ids);
    }
    await Promise.all(
      [...byUser].map(([userId, ids]) => evaluateConfirmedGmailImports(userId, ids)),
    );
    return Response.json(
      { attempted: result.attempted, confirmed: result.confirmed.length },
      { headers },
    );
  } catch {
    return Response.json({ error: "Currency recovery is unavailable." }, { status: 503, headers });
  }
}
