import type { MonaraServiceRoleClient } from "@monara/db";
import { FinanceOperationError } from "./finance.ts";
import type { ForecastRepository } from "./forecast-service.ts";

const PAGE = 1_000;

/** Database errors can echo records, so only a generic error leaves this module. */
function fail(): never {
  throw new FinanceOperationError("INTERNAL", "The forecast could not be read or saved.");
}

/** forecast_runs, forecast_items and the User's confirmed expenses through the service-role client. */
export function createSupabaseForecastRepository(
  client: MonaraServiceRoleClient,
): ForecastRepository {
  return {
    async listConfirmedExpenses(userId, from, to) {
      const rows: Awaited<ReturnType<ForecastRepository["listConfirmedExpenses"]>> = [];
      for (let offset = 0; ; offset += PAGE) {
        const result = await client
          .from("transactions")
          .select("id, occurred_on, merchant_name, category_id, amount")
          .eq("user_id", userId)
          .eq("transaction_type", "expense")
          .eq("review_status", "confirmed")
          .is("deleted_at", null)
          .gte("occurred_on", from)
          .lte("occurred_on", to)
          .order("occurred_on", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (result.error) fail();
        for (const row of result.data) {
          if (row.occurred_on === null || row.amount === null) continue;
          rows.push({
            id: row.id,
            occurredOn: row.occurred_on,
            merchantName: row.merchant_name,
            categoryId: row.category_id,
            amount: Number(row.amount),
          });
        }
        if (result.data.length < PAGE) return rows;
      }
    },

    async replaceForecast(userId, run, items) {
      const result = await client.rpc("replace_forecast", {
        p_user_id: userId,
        p_run: {
          source: run.source,
          month: run.month,
          threshold: run.threshold,
          usedModel: run.usedModel,
          candidateCount: run.candidateCount,
          discardedCount: run.discardedCount,
        },
        p_items: items.map((item) => ({
          predictedOn: item.predictedOn,
          merchantName: item.merchantName,
          categoryId: item.categoryId,
          amount: String(item.amount),
          amountLow: String(item.amountLow),
          amountHigh: String(item.amountHigh),
          confidence: item.confidence,
          pattern: item.pattern,
          reason: item.reason,
        })),
      });
      if (result.error) fail();
    },

    async latestForecast(userId) {
      const run = await client
        .from("forecast_runs")
        .select(
          "id, generated_at, source, month, threshold, used_model, candidate_count, discarded_count",
        )
        .eq("user_id", userId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (run.error) fail();
      if (!run.data) return null;
      const items = await client
        .from("forecast_items")
        .select(
          "id, predicted_on, merchant_name, category_id, amount, amount_low, amount_high, confidence, pattern, reason",
        )
        .eq("user_id", userId)
        .eq("run_id", run.data.id)
        .order("predicted_on", { ascending: true })
        .order("merchant_name", { ascending: true });
      if (items.error) fail();
      const source = run.data.source;
      return {
        run: {
          id: run.data.id,
          generatedAt: run.data.generated_at,
          source:
            source === "weekly" || source === "daily" || source === "agent" ? source : "manual",
          month: run.data.month,
          threshold: Number(run.data.threshold),
          usedModel: run.data.used_model,
          candidateCount: run.data.candidate_count,
          discardedCount: run.data.discarded_count,
        },
        items: items.data.map((item) => ({
          id: item.id,
          predictedOn: item.predicted_on,
          merchantName: item.merchant_name,
          categoryId: item.category_id,
          amount: Number(item.amount),
          amountLow: Number(item.amount_low),
          amountHigh: Number(item.amount_high),
          confidence: Number(item.confidence),
          pattern: item.pattern === "weekly" ? "weekly" : "monthly",
          reason: item.reason,
        })),
      };
    },
  };
}
