// Starts the web app or the agent on this worktree's ports.
// Usage: node scripts/dev.mjs <web|agent>
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_BASE_PORT, INSPECTOR_BASE_PORT, parseEnv, WEB_BASE_PORT } from "./lib/worktree.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];
const shell = process.platform === "win32";

if (target !== "web" && target !== "agent") {
  console.error("Usage: node scripts/dev.mjs <web|agent>");
  process.exit(2);
}

const envFile = join(root, ".worktree.env");
if (!existsSync(envFile)) {
  // Self-heal a linked worktree that skipped setup; a no-op in the main checkout.
  spawnSync(process.execPath, [join(root, "scripts/worktree.mjs"), "setup", "--quiet"], {
    cwd: root,
    stdio: "inherit",
  });
}
const settings = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};

const commands = {
  web: [
    "--filter",
    "@monara/web",
    "exec",
    "next",
    "dev",
    "--hostname",
    "0.0.0.0",
    "--port",
    settings.WEB_PORT ?? String(WEB_BASE_PORT),
  ],
  agent: [
    "--filter",
    "@monara/agent",
    "exec",
    "wrangler",
    "dev",
    "--port",
    settings.AGENT_PORT ?? String(AGENT_BASE_PORT),
    "--inspector-port",
    settings.AGENT_INSPECTOR_PORT ?? String(INSPECTOR_BASE_PORT),
  ],
};

const child = spawn("pnpm", commands[target], { cwd: root, stdio: "inherit", shell });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
