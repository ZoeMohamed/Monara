import { createForecastService, createSupabaseForecastRepository } from "@monara/core";
import { createMonaraServiceRoleClient } from "@monara/db";

import { publicSupabaseConfig } from "@/lib/supabase/config";
import { refineWithAgent } from "./refine.ts";

/** A second refresh within this long returns the forecast just made, so a double tap costs nothing. */
const COOLDOWN_MS = 20_000;

/** The forecast service for server code, built from server-only configuration. */
export function forecastService() {
  const client = createMonaraServiceRoleClient(
    publicSupabaseConfig(),
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  return {
    service: createForecastService({
      repository: createSupabaseForecastRepository(client),
      refine: refineWithAgent({
        agentUrl: process.env.MONARA_AGENT_URL,
        secret: process.env.MONARA_AGENT_BACKEND_SECRET,
      }),
      cooldownMs: COOLDOWN_MS,
    }),
    client,
  };
}
