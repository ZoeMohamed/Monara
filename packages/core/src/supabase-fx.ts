import { type FxSnapshot, fxSnapshotSchema } from "@monara/contracts";
import type { MonaraServiceRoleClient } from "@monara/db";
import { createFxService } from "./fx.ts";

/** Rates contain only public pair/day data; inserts never replace an existing snapshot. */
export function createSupabaseFxService(client: MonaraServiceRoleClient) {
  async function load(day: string, signal: AbortSignal): Promise<FxSnapshot | null> {
    const result = await client
      .from("fx_reference_rates")
      .select("requested_on, rate_date, rate::text, source")
      .eq("requested_on", day)
      .abortSignal(signal)
      .maybeSingle();
    if (result.error || !result.data) return null;
    return fxSnapshotSchema.parse({
      rate: String(result.data.rate),
      rateDate: result.data.rate_date,
      requestedOn: result.data.requested_on,
      source: result.data.source,
      rounding: "half_up_rupiah",
    });
  }
  return createFxService({
    load,
    async save(snapshot, signal) {
      const result = await client
        .from("fx_reference_rates")
        .upsert(
          {
            requested_on: snapshot.requestedOn,
            rate_date: snapshot.rateDate,
            rate: snapshot.rate as unknown as number,
            source: snapshot.source,
          },
          { onConflict: "requested_on", ignoreDuplicates: true },
        )
        .abortSignal(signal);
      if (result.error || signal.aborted) return null;
      return load(snapshot.requestedOn, signal);
    },
  });
}

/** Jobs are leased before provider work; completion checks the exact version again. */
export async function recoverTransactionFx(client: MonaraServiceRoleClient) {
  const jobs = await client.rpc("claim_transaction_fx_jobs", { p_limit: 10 });
  if (jobs.error) throw new Error("Currency recovery is unavailable.");
  const fx = createSupabaseFxService(client);
  const confirmed: { userId: string; transactionId: string }[] = [];
  for (const job of jobs.data) {
    if (!(await fx.rateFor(job.occurred_on))) continue;
    const result = await client
      .rpc("apply_transaction_fx", {
        p_transaction_id: job.transaction_id,
        p_user_id: job.user_id,
        p_expected_updated_at: job.expected_updated_at,
      })
      .single();
    if (result.error) throw new Error("Currency recovery could not be saved.");
    if (result.data.applied && result.data.confirmed)
      confirmed.push({ userId: job.user_id, transactionId: job.transaction_id });
  }
  return { attempted: jobs.data.length, confirmed };
}
