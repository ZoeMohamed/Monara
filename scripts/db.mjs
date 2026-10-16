// Local Supabase stack for this checkout. start optionally requires --runtime docker.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWriteEnv } from "./lib/atomic-env.mjs";
import { localDatabaseValues, verifyLocalDatabase } from "./lib/database-env.mjs";
import { setEnvValues } from "./lib/worktree.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2];
const args = process.argv.slice(3);
const dockerRuntime =
  command === "start" && args.length === 2 && args[0] === "--runtime" && args[1] === "docker";
const shell = process.platform === "win32";
const usage = "Usage: node scripts/db.mjs start [--runtime docker] | stop | status";

const supabase = (args, options = {}) =>
  spawnSync("pnpm", ["exec", "supabase", ...args], { cwd: root, shell, ...options });

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function writeWebEnv() {
  const result = supabase(["status", "--env", "--output-format", "json"], { encoding: "utf8" });
  if (result.status !== 0) fail("Could not read the local Supabase status.");
  const values = localDatabaseValues(result.stdout);
  await verifyLocalDatabase(values);
  const target = join(root, "apps/web/.env.local");
  const template = join(root, "apps/web/.env.example");
  const current = existsSync(target)
    ? readFileSync(target, "utf8")
    : readFileSync(template, "utf8");
  atomicWriteEnv(target, setEnvValues(current, values));
  console.log("Updated Supabase values in apps/web/.env.local.");
}

if (args.length > 0 && !dockerRuntime) fail(usage);

if (command === "start") {
  const started = supabase(dockerRuntime ? ["start", "--runtime", "docker"] : ["start"], {
    stdio: ["inherit", "ignore", "inherit"],
  });
  if (started.status !== 0) fail("supabase start failed. Is Docker or OrbStack running?");
  const migrated = supabase(["migration", "up", "--local"], {
    stdio: ["inherit", "ignore", "inherit"],
  });
  if (migrated.status !== 0)
    fail("Local migrations failed. Setup is incomplete; no database reset was attempted.");
  try {
    await writeWebEnv();
    console.log("Local database is ready. Run pnpm dev (and pnpm dev:agent when needed).");
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown readiness error";
    fail(
      `Local database readiness failed: ${reason}. Check the local stack and migrations, then rerun pnpm db:start --runtime docker.`,
    );
  }
} else if (command === "stop") {
  process.exit(supabase(["stop"], { stdio: "inherit" }).status ?? 1);
} else if (command === "status") {
  process.exit(supabase(["status"], { stdio: "inherit" }).status ?? 1);
} else {
  fail(usage);
}
