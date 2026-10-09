// Per-worktree local environment: port slot, env files, and local Supabase stack cleanup.
// Usage: node scripts/worktree.mjs <setup|teardown|prune|status> [--quiet]
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import {
  allocateSlot,
  portsForSlot,
  releaseSlot,
  setEnvValues,
  worktreeEnvContent,
} from "./lib/worktree.mjs";

const SUPABASE_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const LOCK_STALE_MS = 30_000;

const [command = "status", ...flags] = process.argv.slice(2);
const quiet = flags.includes("--quiet");
const log = (message) => {
  if (!quiet) console.log(message);
};

const git = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function canonical(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function registeredWorktrees(cwd) {
  return new Set(
    git(["worktree", "list", "--porcelain"], cwd)
      .split("\n")
      .filter((line) => line.startsWith("worktree "))
      .map((line) => canonical(line.slice("worktree ".length))),
  );
}

function resolveContext() {
  const root = realpathSync(git(["rev-parse", "--show-toplevel"], process.cwd()));
  const commonDir = resolve(root, git(["rev-parse", "--git-common-dir"], root));
  const mainLine = git(["worktree", "list", "--porcelain"], root)
    .split("\n")
    .find((line) => line.startsWith("worktree "));
  const main = realpathSync(mainLine.slice("worktree ".length));
  return {
    root,
    main,
    isMain: root === main,
    isLive: (path) => existsSync(path) && registeredWorktrees(root).has(canonical(path)),
    registry: join(commonDir, "monara-worktree-ports.json"),
  };
}

async function withLock(registry, action) {
  const lock = `${registry}.lock`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      mkdirSync(lock);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) rmSync(lock, { recursive: true });
      await new Promise((done) => setTimeout(done, 100));
      if (attempt === 99) throw new Error(`Timed out waiting for ${lock}`);
    }
  }
  try {
    return await action();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

const readClaims = (registry) =>
  existsSync(registry) ? JSON.parse(readFileSync(registry, "utf8")) : {};
const writeClaims = (registry, claims) =>
  writeFileSync(registry, `${JSON.stringify(claims, null, 2)}\n`);

function seedEnvFile({ destination, mainSource, template, values, blankKeys = [] }) {
  if (existsSync(destination)) return false;
  const source = existsSync(mainSource) ? mainSource : template;
  const blanked = Object.fromEntries(blankKeys.map((key) => [key, ""]));
  const content = setEnvValues(readFileSync(source, "utf8"), { ...blanked, ...values });
  writeFileSync(destination, content);
  return true;
}

function supabaseBin({ root, main }) {
  return [root, main]
    .map((dir) => join(dir, "node_modules/.bin/supabase"))
    .find((path) => existsSync(path));
}

function listStacks(bin, cwd) {
  const result = spawnSync(bin, ["stack", "list", "--output-format", "json"], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) return [];
  try {
    return JSON.parse(result.stdout).stacks ?? [];
  } catch {
    return [];
  }
}

function destroyStack(bin, cwd, id) {
  const result = spawnSync(bin, ["stack", "destroy", "--stack-id", id, "--yes"], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) console.warn(`Could not destroy Supabase stack ${id.slice(0, 12)}.`);
  return result.status === 0;
}

async function setup(context) {
  if (context.isMain) {
    log("Main checkout: base ports (web 3000, agent 8787). Nothing to set up.");
    return;
  }
  const slot = await withLock(context.registry, async () => {
    const allocation = await allocateSlot({
      claims: readClaims(context.registry),
      worktreePath: context.root,
      isLive: context.isLive,
    });
    writeClaims(context.registry, allocation.claims);
    return allocation.slot;
  });
  const ports = portsForSlot(slot);
  writeFileSync(join(context.root, ".worktree.env"), worktreeEnvContent(slot));

  const seeded = [
    seedEnvFile({
      destination: join(context.root, "apps/web/.env.local"),
      mainSource: join(context.main, "apps/web/.env.local"),
      template: join(context.root, "apps/web/.env.example"),
      values: { MONARA_AGENT_URL: `http://localhost:${ports.agent}` },
      blankKeys: SUPABASE_ENV_KEYS,
    }),
    seedEnvFile({
      destination: join(context.root, "apps/agent/.dev.vars"),
      mainSource: join(context.main, "apps/agent/.dev.vars"),
      template: join(context.root, "apps/agent/.dev.vars.example"),
      values: { MONARA_BACKEND_URL: `http://localhost:${ports.web}` },
    }),
  ];
  log(
    `Worktree slot ${slot}: web ${ports.web}, agent ${ports.agent}, inspector ${ports.inspector}.`,
  );
  if (seeded.some(Boolean)) {
    log("Seeded local env files. Run `pnpm db:start` to start this worktree's own Supabase stack.");
  }
}

async function teardown(context) {
  if (context.isMain) {
    log("Refusing to tear down the main checkout.");
    return;
  }
  const bin = supabaseBin(context);
  if (bin) {
    for (const stack of listStacks(bin, context.root)) {
      if (stack.project_root === context.root && destroyStack(bin, context.root, stack.id)) {
        log(`Destroyed Supabase stack ${stack.id.slice(0, 12)}.`);
      }
    }
  } else {
    console.warn("Supabase CLI not found; skipping stack cleanup.");
  }
  await withLock(context.registry, async () => {
    writeClaims(context.registry, releaseSlot(readClaims(context.registry), context.root));
  });
  log("Released worktree slot.");
}

async function prune(context) {
  await withLock(context.registry, async () => {
    const claims = readClaims(context.registry);
    const live = Object.fromEntries(
      Object.entries(claims).filter(([path]) => context.isLive(path)),
    );
    writeClaims(context.registry, live);
    log(`Dropped ${Object.keys(claims).length - Object.keys(live).length} dead slot claim(s).`);
  });
  const bin = supabaseBin(context);
  if (!bin) return;
  for (const stack of listStacks(bin, context.main)) {
    if (!context.isLive(stack.project_root) && destroyStack(bin, context.main, stack.id)) {
      log(`Destroyed orphaned Supabase stack for ${stack.project_root}.`);
    }
  }
}

function status(context) {
  const claims = readClaims(context.registry);
  console.log(`Checkout: ${context.isMain ? "main" : "linked worktree"} (${context.root})`);
  for (const [path, slot] of Object.entries(claims)) {
    const ports = portsForSlot(slot);
    console.log(`slot ${slot}: web ${ports.web}, agent ${ports.agent}  ${path}`);
  }
}

const handlers = { setup, teardown, prune, status };
if (!handlers[command]) {
  console.error(`Unknown command "${command}". Use setup, teardown, prune, or status.`);
  process.exit(2);
}
let context;
try {
  context = resolveContext();
} catch (error) {
  // `pnpm install` runs setup from `prepare`, including where there is no git checkout (CI, Vercel).
  if (command === "setup" && quiet) process.exit(0);
  throw error;
}
await handlers[command](context);
