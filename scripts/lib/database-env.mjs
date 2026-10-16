import { parseEnv } from "./worktree.mjs";

export function localDatabaseValues(output) {
  let status;
  try {
    const parsed = JSON.parse(output);
    status = parsed.env ?? parsed;
  } catch {
    status = parseEnv(output.replaceAll('"', ""));
  }
  const serviceRoleKey = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY;
  if (!status.API_URL || !status.PUBLISHABLE_KEY || !serviceRoleKey) {
    throw new Error("Supabase status is missing the API URL or keys.");
  }
  const url = new URL(status.API_URL);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Refusing to configure a database outside this machine.");
  }
  return {
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  };
}

export async function verifyLocalDatabase(values, request = fetch) {
  const response = await request(
    `${values.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/rest/v1/financial_accounts?select=id&limit=0`,
    {
      headers: {
        apikey: values.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${values.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) {
    throw new Error(`Local database readiness check failed (HTTP ${response.status}).`);
  }
  await response.body?.cancel();
}
