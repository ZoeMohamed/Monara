// Replay and validate only this checkout's disposable local database.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const typesPath = "packages/db/src/types/database.types.ts";

function sqlFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sqlFiles(path);
    return entry.isFile() && /\.sql$/i.test(entry.name) ? [path] : [];
  });
}

export function validateMigrations(names) {
  const versions = new Set();
  for (const name of names) {
    const match = /^(\d{14})_[a-z][a-z0-9]*(?:_[a-z0-9]+)*\.sql$/.exec(name);
    if (!match) {
      throw new Error(`Invalid migration name: ${name}. Use YYYYMMDDHHMMSS_snake_case.sql.`);
    }
    const [year, month, day, hour, minute, second] = [
      match[1].slice(0, 4),
      match[1].slice(4, 6),
      match[1].slice(6, 8),
      match[1].slice(8, 10),
      match[1].slice(10, 12),
      match[1].slice(12, 14),
    ];
    const timestamp = `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime()) || date.toISOString() !== timestamp) {
      throw new Error(`Invalid UTC migration timestamp: ${name}.`);
    }
    if (versions.has(match[1])) throw new Error(`Duplicate migration timestamp: ${match[1]}.`);
    versions.add(match[1]);
  }
}

export function checkDb({ root, reset = false, run = spawnSync, log = console.log }) {
  root = realpathSync(root);
  const directory = join(root, "supabase/migrations");
  if (existsSync(directory) && realpathSync(directory) !== directory) {
    throw new Error(
      "The migrations directory must remain inside this checkout without symbolic links.",
    );
  }
  const entries = existsSync(directory) ? readdirSync(directory, { withFileTypes: true }) : [];
  if (
    entries.some((entry) => entry.isDirectory() && sqlFiles(join(directory, entry.name)).length)
  ) {
    throw new Error("SQL migrations must be regular files directly under supabase/migrations.");
  }
  const migrations = entries.filter((entry) => /\.sql$/i.test(entry.name));
  if (migrations.length === 0) {
    log("Database check skipped: no SQL migrations exist yet; no local stack was started.");
    return;
  }
  if (migrations.some((entry) => !entry.isFile())) {
    throw new Error("SQL migrations must be regular files directly under supabase/migrations.");
  }
  validateMigrations(migrations.map((entry) => entry.name));
  const testsDirectory = join(root, "supabase/tests/database");
  if (existsSync(testsDirectory) && realpathSync(testsDirectory) !== testsDirectory) {
    throw new Error(
      "The database test directory must remain inside this checkout without symbolic links.",
    );
  }
  const tests = sqlFiles(testsDirectory);
  if (!tests.some((path) => /(?:^|[_-])(rls|ownership)(?:[_.-]|$)/i.test(basename(path)))) {
    throw new Error(
      "Migrations require ownership/RLS pgTAP tests under supabase/tests/database (include rls or ownership in the SQL filename).",
    );
  }
  if (!existsSync(join(root, typesPath))) {
    throw new Error(`Migrations require generated ${typesPath}. Run pnpm db:types locally.`);
  }

  const invoke = (command, args, capture = false) => {
    const result = run(command, args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      shell: process.platform === "win32",
      stdio: capture ? "pipe" : "inherit",
      env: { ...process.env, SUPABASE_WORKDIR: root, SUPABASE_EXPERIMENTAL_STACK: "1" },
    });
    if (result.error || result.status !== 0) {
      throw new Error(`${command} ${args.join(" ")} failed.`);
    }
    return result;
  };
  if (process.env.CI === "true") {
    try {
      invoke("git", ["ls-files", "--error-unmatch", "--", typesPath], true);
    } catch {
      throw new Error(
        `CI requires tracked generated ${typesPath}; include it with the migrations.`,
      );
    }
  }
  if (!reset) {
    throw new Error(
      "Replay requires pnpm db:check --reset. This resets this checkout's local database, including saved stopped data. Use a disposable checkout or stack.",
    );
  }
  // Require Docker rather than allowing the experimental CLI to fall back to native processes.
  invoke("docker", ["info"], true);
  const listed = invoke(
    "pnpm",
    ["exec", "supabase", "stack", "list", "--output-format", "json"],
    true,
  );
  let stacks;
  try {
    stacks = JSON.parse(listed.stdout).stacks;
  } catch {
    throw new Error("Could not parse the local Supabase stack list; refusing to reset.");
  }
  if (
    !Array.isArray(stacks) ||
    stacks.some(
      (stack) =>
        !stack ||
        typeof stack.project_root !== "string" ||
        typeof stack.owner !== "string" ||
        typeof stack.runtime !== "string",
    ) ||
    listed.stderr?.includes("skipping invalid stack")
  ) {
    throw new Error("Could not verify the local Supabase stack list; refusing to reset.");
  }
  const checkoutStacks = stacks.filter((stack) => stack.project_root === root);
  if (checkoutStacks.some((stack) => stack.owner !== "unavailable")) {
    throw new Error(
      "A Supabase stack in this checkout is running. Stop it first only if its data is disposable (pnpm db:stop), or use a separate worktree.",
    );
  }
  if (checkoutStacks.some((stack) => stack.runtime !== "docker")) {
    throw new Error(
      "This checkout has a non-Docker stack. Use a disposable Docker worktree for db:check.",
    );
  }

  let failure;
  try {
    invoke("pnpm", ["db:start", "--runtime", "docker"]);
    invoke("pnpm", ["exec", "supabase", "db", "reset", "--local"]);
    invoke("pnpm", [
      "exec",
      "supabase",
      "db",
      "lint",
      "--local",
      "--schema",
      "public",
      "--level",
      "warning",
      "--fail-on",
      "warning",
    ]);
    invoke("pnpm", ["exec", "supabase", "test", "db", "--local"]);
    invoke("pnpm", ["db:types", "--check"]);
  } catch (error) {
    failure = error;
  } finally {
    // start can partially succeed before failing; this checkout was verified stopped above.
    try {
      invoke("pnpm", ["db:stop"]);
    } catch (error) {
      failure = failure
        ? new AggregateError([failure, error], "Database check and stack cleanup failed.")
        : error;
    }
  }
  if (failure) throw failure;
  log(
    "Database check passed: local migrations, SQL lint, ownership/RLS tests, and generated types.",
  );
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== "--reset") || args.length > 1) {
      throw new Error("Usage: pnpm db:check [--reset]");
    }
    checkDb({
      root: fileURLToPath(new URL("../", import.meta.url)),
      reset: args.includes("--reset"),
    });
  } catch (error) {
    console.error(error.message);
    if (error instanceof AggregateError) {
      for (const cause of error.errors) console.error(cause.message);
    }
    process.exitCode = 1;
  }
}
