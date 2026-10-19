import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { atomicWriteEnv } from "./atomic-env.mjs";
import { envValueLiteral, seedEnvContent, setEnvValues } from "./worktree.mjs";

const DATABASE_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const SHARED_SECRET = "MONARA_AGENT_BACKEND_SECRET";
const readOptional = (path) => (existsSync(path) ? readFileSync(path, "utf8") : undefined);

/** Plan all credential changes before writing, so conflicting secrets leave both files intact. */
export function seedWorktreeEnvironment({ root, source, ports }) {
  const missingSources = [];
  const files = [
    {
      path: "apps/web/.env.local",
      template: "apps/web/.env.example",
      values: { MONARA_AGENT_URL: `http://localhost:${ports.agent}` },
      blankKeys: DATABASE_KEYS,
    },
    {
      path: "apps/agent/.dev.vars",
      template: "apps/agent/.dev.vars.example",
      values: { MONARA_BACKEND_URL: `http://localhost:${ports.web}` },
    },
    {
      path: "apps/agent/.env.cloudflare.local",
      template: "apps/agent/.env.cloudflare.example",
      optional: true,
    },
  ];
  const updates = [];
  for (const file of files) {
    const inherited = readOptional(join(source, file.path));
    const existing = readOptional(join(root, file.path));
    if (file.optional && inherited === undefined && existing === undefined) continue;
    if (!file.optional && inherited === undefined) missingSources.push(file.path);
    updates.push({
      path: file.path,
      existing,
      content: seedEnvContent({
        template: readFileSync(join(root, file.template), "utf8"),
        // CLI account and token are one configuration. Never combine a partial
        // existing file with another checkout's account or credential.
        source: file.optional && existing !== undefined ? undefined : inherited,
        existing,
        values: file.values,
        blankKeys: file.blankKeys,
      }),
    });
  }

  const runtime = updates.slice(0, 2);
  const secrets = runtime
    .map((file) => parseEnv(file.content)[SHARED_SECRET]?.trim())
    .filter(Boolean);
  if (new Set(secrets).size > 1) {
    throw new Error(
      "Web and agent MONARA_AGENT_BACKEND_SECRET values differ. Align the local env files before continuing.",
    );
  }
  // Reuse the original dotenv literal, including quotes and inline comments.
  const owner = runtime.find((file) => parseEnv(file.content)[SHARED_SECRET]?.trim());
  const secret = owner
    ? envValueLiteral(owner.content, SHARED_SECRET)
    : randomBytes(32).toString("hex");
  for (const file of runtime) {
    if (!parseEnv(file.content)[SHARED_SECRET]?.trim()) {
      file.content = setEnvValues(file.content, { [SHARED_SECRET]: secret });
    }
  }

  const changed = [];
  for (const file of updates) {
    if (file.content === file.existing) continue;
    atomicWriteEnv(join(root, file.path), file.content);
    changed.push(file.path);
  }
  return { changed, missingSources };
}
