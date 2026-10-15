// Exposes this worktree's web app through ngrok, so Composio can reach the Gmail callback.
// Usage: node scripts/tunnel.mjs
// Reads NGROK_DOMAIN and the optional NGROK_AUTHTOKEN from apps/web/.env.local.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { configuredTunnelOrigin } from "../apps/web/src/lib/http/origin.ts";
import { parseEnv, WEB_BASE_PORT } from "./lib/worktree.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readEnv = (path) => (existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {});

const port = readEnv(join(root, ".worktree.env")).WEB_PORT ?? String(WEB_BASE_PORT);
const settings = readEnv(join(root, "apps/web/.env.local"));
const domain = process.env.NGROK_DOMAIN ?? settings.NGROK_DOMAIN;
const authtoken = process.env.NGROK_AUTHTOKEN ?? settings.NGROK_AUTHTOKEN;

if (!domain) {
  console.error("Set NGROK_DOMAIN in apps/web/.env.local, for example monara.ngrok-free.dev.");
  process.exit(1);
}

const origin = configuredTunnelOrigin(domain);
if (!origin) {
  console.error(
    "NGROK_DOMAIN must be a public HTTPS hostname, without a path, port or credentials.",
  );
  process.exit(1);
}
console.log(`Forwarding ${origin} to http://localhost:${port}. Keep pnpm dev running.`);
console.log(`Open ${origin}/connections/gmail and sign in there to keep the callback session.`);
console.log(`Composio project identity verifier: ${origin}/api/gmail/connections/callback`);
console.log(`Supabase Auth redirect allowlist: ${origin}/auth/callback`);
console.log("If ngrok reports the endpoint is already online, someone else is using the tunnel.");

// An empty NGROK_AUTHTOKEN falls back to the token in ngrok's own config file.
const env = authtoken ? { ...process.env, NGROK_AUTHTOKEN: authtoken } : process.env;
const child = spawn("ngrok", ["http", port, "--url", origin], { env, stdio: "inherit" });
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
