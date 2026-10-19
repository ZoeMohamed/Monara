import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseEnv } from "node:util";
import { seedWorktreeEnvironment } from "./lib/worktree-env.mjs";

const web = "apps/web/.env.local";
const agent = "apps/agent/.dev.vars";
const cloudflare = "apps/agent/.env.cloudflare.local";
const ports = { web: 3007, agent: 8794 };
const shared = "MONARA_AGENT_BACKEND_SECRET";

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "monara-worktree-env-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = join(dir, "worktree");
  const source = join(dir, "main");
  for (const checkout of [root, source]) {
    for (const app of ["apps/web", "apps/agent"])
      mkdirSync(join(checkout, app), { recursive: true });
  }
  for (const file of [
    "apps/web/.env.example",
    "apps/agent/.dev.vars.example",
    "apps/agent/.env.cloudflare.example",
  ]) {
    writeFileSync(join(root, file), readFileSync(new URL(`../${file}`, import.meta.url)));
  }
  const write = (checkout, path, content) => writeFileSync(join(checkout, path), content);
  const read = (path) => readFileSync(join(root, path), "utf8");
  const seed = () => seedWorktreeEnvironment({ root, source, ports });
  return { root, source, write, read, seed };
}

test("fresh worktree copies all three local env files, keeps dotenv syntax, and isolates URLs and database", (t) => {
  const f = fixture(t);
  f.write(
    f.source,
    web,
    `${shared}="shared#secret"\nCOMPOSIO_API_KEY=dev-key\nNEXT_PUBLIC_SUPABASE_URL=https://source.invalid\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=source-publishable\nSUPABASE_SERVICE_ROLE_KEY=source-service\nNGROK_DOMAIN=example.invalid\n`,
  );
  f.write(
    f.source,
    agent,
    `${shared}='shared#secret'\nLLM_API_KEY="first\nsecond#part"\nLLM_BASE_URL=https://llm.invalid/v1\n`,
  );
  f.write(
    f.source,
    cloudflare,
    "# optional CLI access\nCLOUDFLARE_ACCOUNT_ID=test-account\nCLOUDFLARE_API_TOKEN='synthetic#token'\n",
  );
  assert.deepEqual(f.seed(), { changed: [web, agent, cloudflare], missingSources: [] });
  const values = parseEnv(f.read(web));
  assert.equal(values.COMPOSIO_API_KEY, "dev-key");
  assert.equal(values.NGROK_DOMAIN, "example.invalid");
  assert.equal(values.MONARA_AGENT_URL, "http://localhost:8794");
  for (const key of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ])
    assert.equal(values[key], "");
  assert.equal(parseEnv(f.read(agent)).MONARA_BACKEND_URL, "http://localhost:3007");
  assert.equal(parseEnv(f.read(agent)).LLM_API_KEY, "first\nsecond#part");
  assert.equal(parseEnv(f.read(web))[shared], parseEnv(f.read(agent))[shared]);
  assert.equal(parseEnv(f.read(cloudflare)).CLOUDFLARE_API_TOKEN, "synthetic#token");
  if (process.platform !== "win32") {
    for (const path of [web, agent, cloudflare])
      assert.equal(statSync(join(f.root, path)).mode & 0o777, 0o600);
  }
  assert.deepEqual(f.seed().changed, []);
});

test("repeat setup inherits new source keys while preserving worktree credentials, blanks, and local database", (t) => {
  const f = fixture(t);
  f.write(
    f.root,
    web,
    `${shared}=custom-secret\nCOMPOSIO_API_KEY=custom-dev\nCOMPOSIO_GMAIL_TRIGGERS_ENABLED=\nNEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399\nSUPABASE_SERVICE_ROLE_KEY=own-stack\n`,
  );
  f.write(f.root, agent, `${shared}=custom-secret\n`);
  f.write(
    f.source,
    web,
    `${shared}=different-source\nCOMPOSIO_API_KEY=source-dev\nCOMPOSIO_GMAIL_TRIGGERS_ENABLED=true\nNGROK_DOMAIN=new-domain.invalid\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=other-stack\n`,
  );
  f.write(f.source, agent, `${shared}=different-source\nLLM_API_KEY=new-dev-key\n`);
  f.seed();
  const values = parseEnv(f.read(web));
  assert.equal(values.COMPOSIO_API_KEY, "custom-dev");
  assert.equal(values.COMPOSIO_GMAIL_TRIGGERS_ENABLED, "");
  assert.equal(values.NGROK_DOMAIN, "new-domain.invalid");
  assert.equal(values.NEXT_PUBLIC_SUPABASE_URL, "http://127.0.0.1:54399");
  assert.equal(values.SUPABASE_SERVICE_ROLE_KEY, "own-stack");
  assert.equal(values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "");
  assert.equal(parseEnv(f.read(agent)).LLM_API_KEY, "new-dev-key");
  assert.equal(values[shared], "custom-secret");
  assert.deepEqual(f.seed().changed, []);
});

test("absent credentials produce templates, a matching local secret, and no optional CLI file", (t) => {
  const f = fixture(t);
  assert.deepEqual(f.seed(), { changed: [web, agent], missingSources: [web, agent] });
  assert.match(parseEnv(f.read(web))[shared], /^[a-f0-9]{64}$/);
  assert.equal(parseEnv(f.read(web))[shared], parseEnv(f.read(agent))[shared]);
  assert.equal(existsSync(join(f.root, cloudflare)), false);
});

test("conflicting shared secrets fail before changing any existing env file", (t) => {
  const f = fixture(t);
  f.write(f.root, web, `${shared}=web-secret\n`);
  f.write(f.root, agent, `${shared}=agent-secret\n`);
  const before = [f.read(web), f.read(agent)];
  assert.throws(f.seed, /values differ/);
  assert.deepEqual([f.read(web), f.read(agent)], before);
});

test("a missing shared secret receives the effective quoted multiline value from its peer", (t) => {
  const f = fixture(t);
  f.write(f.source, web, `${shared}=superseded\n${shared}='first\nsecond#part'\n`);
  f.write(f.source, agent, `${shared}=\n`);
  f.seed();
  assert.equal(parseEnv(f.read(web))[shared], "first\nsecond#part");
  assert.equal(parseEnv(f.read(agent))[shared], "first\nsecond#part");
  assert.deepEqual(f.seed().changed, []);
});

test("an existing optional CLI file keeps its own account and token", (t) => {
  const f = fixture(t);
  f.write(
    f.source,
    cloudflare,
    "CLOUDFLARE_ACCOUNT_ID=source-account\nCLOUDFLARE_API_TOKEN=source-token\n",
  );
  const existing = "CLOUDFLARE_ACCOUNT_ID=own-account\nCLOUDFLARE_API_TOKEN=own-token\n";
  f.write(f.root, cloudflare, existing);
  f.seed();
  assert.equal(f.read(cloudflare), existing);
});

test("a partial existing CLI file never inherits a different account or token", (t) => {
  const f = fixture(t);
  f.write(
    f.source,
    cloudflare,
    "CLOUDFLARE_ACCOUNT_ID=source-account\nCLOUDFLARE_API_TOKEN=source-token\n",
  );
  f.write(f.root, cloudflare, "CLOUDFLARE_API_TOKEN=own-token\n");
  f.seed();
  const values = parseEnv(f.read(cloudflare));
  assert.equal(values.CLOUDFLARE_API_TOKEN, "own-token");
  assert.equal(values.CLOUDFLARE_ACCOUNT_ID, "");
});
