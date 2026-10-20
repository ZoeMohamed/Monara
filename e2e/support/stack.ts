// Synthetic Users and an authenticated API caller for the local Monara stack.
// Everything here is local and synthetic: no real Google account, mailbox or provider.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  createMonaraServerClient,
  createMonaraServiceRoleClient,
  type PublicSupabaseConfig,
} from "@monara/db";
import type { APIRequestContext, Browser, BrowserContext } from "@playwright/test";

export function repoRoot(): string {
  let directory = process.cwd();
  while (!existsSync(join(directory, "pnpm-workspace.yaml"))) {
    const parent = dirname(directory);
    if (parent === directory) throw new Error("Run the e2e suite inside the Monara repository.");
    directory = parent;
  }
  return directory;
}

function readEnvFile(path: string): Map<string, string> {
  const values = new Map<string, string>();
  if (!existsSync(path)) return values;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) values.set(match[1], match[2].trim());
  }
  return values;
}

export interface LocalStack {
  webUrl: string;
  agentUrl: string;
  supabase: PublicSupabaseConfig;
  serviceRoleKey: string;
  agentSecret: string;
  kapsoWebhookSecret: string;
}

/** Reads this checkout's local stack settings. Values are used, never printed. */
export function localStack(): LocalStack {
  const root = repoRoot();
  const web = readEnvFile(join(root, "apps/web/.env.local"));
  const ports = readEnvFile(join(root, ".worktree.env"));
  const required = (name: string) => {
    const value = web.get(name);
    if (!value) throw new Error(`${name} is missing from apps/web/.env.local. Run pnpm db:start.`);
    return value;
  };
  return {
    webUrl: `http://localhost:${ports.get("WEB_PORT") ?? "3000"}`,
    agentUrl: `http://localhost:${ports.get("AGENT_PORT") ?? "8787"}`,
    supabase: {
      url: required("NEXT_PUBLIC_SUPABASE_URL"),
      publishableKey: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    },
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    agentSecret: required("MONARA_AGENT_BACKEND_SECRET"),
    kapsoWebhookSecret: required("KAPSO_WEBHOOK_SECRET"),
  };
}

export function serviceClient(stack: LocalStack) {
  return createMonaraServiceRoleClient(stack.supabase, stack.serviceRoleKey);
}

export interface TestUser {
  label: string;
  id: string;
  email: string;
  accessToken: string;
  cookies: { name: string; value: string }[];
  setupKey: string;
}

const runTag = randomBytes(4).toString("hex");

/**
 * Creates a synthetic User marked as a Google sign-in, as local evidence for the
 * deletion design did, then signs in and keeps the session cookies the app expects.
 */
export async function createTestUser(stack: LocalStack, label: string): Promise<TestUser> {
  const email = `e2e-${label.toLowerCase()}-${runTag}@example.test`;
  const password = randomBytes(24).toString("base64url");
  const admin = serviceClient(stack);
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { provider: "google", providers: ["google"] },
    user_metadata: { full_name: `Synthetic User ${label}` },
  });
  if (created.error || !created.data.user) {
    throw new Error(`Could not create synthetic User ${label}: ${created.error?.message}`);
  }
  const jar = new Map<string, string>();
  const client = createMonaraServerClient(stack.supabase, {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (cookies) => {
      for (const cookie of cookies) {
        if (cookie.value) jar.set(cookie.name, cookie.value);
        else jar.delete(cookie.name);
      }
    },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) {
    throw new Error(`Could not sign in synthetic User ${label}: ${signedIn.error?.message}`);
  }
  const id = created.data.user.id;
  return {
    label,
    id,
    email,
    accessToken: signedIn.data.session.access_token,
    cookies: [...jar].map(([name, value]) => ({ name, value })),
    setupKey: createHash("sha256").update(`monara-setup:${id}`).digest("hex"),
  };
}

export const MOBILE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
} as const;

/** A mobile browser signed in as the User, with first-run setup and the tour already seen. */
export async function signedInContext(
  browser: Browser,
  stack: LocalStack,
  user: TestUser | null,
): Promise<BrowserContext> {
  const context = await browser.newContext({ ...MOBILE, baseURL: stack.webUrl });
  if (user) {
    await context.addCookies(
      user.cookies.map((cookie) => ({ ...cookie, url: stack.webUrl, sameSite: "Lax" as const })),
    );
    await context.addInitScript((setupKey) => {
      window.localStorage.setItem(`monara.onboarding.v2.live.${setupKey}`, "done");
      window.localStorage.setItem("monara.tour.v1.live", "done");
      window.localStorage.setItem("monara.tour.v1.demo", "done");
    }, user.setupKey);
  }
  return context;
}

function cookieHeader(user: TestUser): string {
  return user.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

export interface RecordedResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

/** Calls a Monara route as the User from the app's own origin, the way the browser does. */
export async function callAs(
  request: APIRequestContext,
  stack: LocalStack,
  user: TestUser | null,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<RecordedResponse> {
  const response = await request.fetch(`${stack.webUrl}${path}`, {
    method,
    headers: {
      Origin: stack.webUrl,
      ...(user ? { Cookie: cookieHeader(user) } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    data: body === undefined ? undefined : JSON.stringify(body),
    maxRedirects: 0,
  });
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Non-JSON bodies, such as redirects, are kept as text.
  }
  return { status: response.status(), body: parsed, headers: response.headers() };
}

export function financeOperation(
  request: APIRequestContext,
  stack: LocalStack,
  user: TestUser,
  operation: string,
  input: unknown,
  headers: Record<string, string> = {},
) {
  return callAs(
    request,
    stack,
    user,
    "POST",
    `/api/finance/operations/${operation}`,
    input,
    headers,
  );
}

export const requestId = () => randomUUID();

export function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}
