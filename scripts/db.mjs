// Local Supabase stack for this checkout. Usage: node scripts/db.mjs <start|stop|status>
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv, setEnvValues } from "./lib/worktree.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2];
const shell = process.platform === "win32";

const supabase = (args, options = {}) =>
  spawnSync("pnpm", ["exec", "supabase", ...args], { cwd: root, shell, ...options });

function fail(message) {
  console.error(message);
  process.exit(1);
}

function writeWebEnv() {
  const result = supabase(["status", "--env", "--output-format", "json"], { encoding: "utf8" });
  if (result.status !== 0) fail("Could not read the local Supabase status.");
  const status = parseStatus(result.stdout);
  const serviceRoleKey = status.SERVICE_ROLE_KEY ?? status.SECRET_KEY;
  if (!status.API_URL || !status.PUBLISHABLE_KEY || !serviceRoleKey) {
    fail("Supabase status is missing the API URL or keys.");
  }
  const target = join(root, "apps/web/.env.local");
  const template = join(root, "apps/web/.env.example");
  const current = existsSync(target)
    ? readFileSync(target, "utf8")
    : readFileSync(template, "utf8");
  writeFileSync(
    target,
    setEnvValues(current, {
      NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    }),
  );
  console.log("Updated Supabase values in apps/web/.env.local.");
}

function parseStatus(output) {
  try {
    const parsed = JSON.parse(output);
    return parsed.env ?? parsed;
  } catch {
    return parseEnv(output.replaceAll('"', ""));
  }
}

if (command === "start") {
  const started = supabase(["start"], { stdio: ["inherit", "ignore", "inherit"] });
  if (started.status !== 0) fail("supabase start failed. Is OrbStack running?");
  writeWebEnv();
} else if (command === "stop") {
  process.exit(supabase(["stop"], { stdio: "inherit" }).status ?? 1);
} else if (command === "status") {
  process.exit(supabase(["status"], { stdio: "inherit" }).status ?? 1);
} else {
  fail("Usage: node scripts/db.mjs <start|stop|status>");
}
