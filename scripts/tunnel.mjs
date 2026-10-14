// Exposes this worktree's web app through ngrok, so Composio can reach the Gmail callback.
// Usage: node scripts/tunnel.mjs
// Reads NGROK_DOMAIN and the optional NGROK_AUTHTOKEN from apps/web/.env.local.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv, WEB_BASE_PORT } from "./lib/worktree.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readEnv = (path) => (existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {});

const port = readEnv(join(root, ".worktree.env")).WEB_PORT ?? String(WEB_BASE_PORT);
const { NGROK_DOMAIN: domain, NGROK_AUTHTOKEN: authtoken } = readEnv(
  join(root, "apps/web/.env.local"),
);

if (!domain) {
  console.error("Set NGROK_DOMAIN in apps/web/.env.local, for example monara.ngrok-free.dev.");
  process.exit(1);
}

const host = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
console.log(`Forwarding https://${host} to http://localhost:${port}. Open the app at that URL.`);
console.log("If ngrok reports the endpoint is already online, someone else is using the tunnel.");

// An empty NGROK_AUTHTOKEN falls back to the token in ngrok's own config file.
const env = authtoken ? { ...process.env, NGROK_AUTHTOKEN: authtoken } : process.env;
const child = spawn("ngrok", ["http", port, "--url", `https://${host}`], { env, stdio: "inherit" });
child.on("error", (error) => {
  console.error(
    error.code === "ENOENT"
      ? "ngrok is not installed. See https://ngrok.com/download."
      : `ngrok could not start: ${error.message}`,
  );
  process.exit(1);
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
