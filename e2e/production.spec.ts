// Read-only checks against the hosted app. No account is used and nothing is written:
// every request is unauthenticated or carries a deliberately wrong credential.
import { expect, test } from "@playwright/test";
import { Evidence } from "./support/evidence.ts";
import { MOBILE } from "./support/stack.ts";

const PRODUCTION = "https://monara-finance.vercel.app";
// The Worker's address is a deployment identifier, so it is supplied at run time.
const AGENT = process.env.E2E_PRODUCTION_AGENT_URL ?? "";

const code = async (response: { json(): Promise<unknown> }) => {
  const body = await response.json().catch(() => null);
  return body !== null && typeof body === "object" && "code" in body ? String(body.code) : "-";
};

test.describe
  .serial("security self-assessment evidence (production, read-only)", () => {
    test("PROD-01 Signed-out boundary on the hosted app", async ({ browser, request }, info) => {
      const ev = new Evidence(info, {
        id: "PROD-01",
        title: "Signed-out boundary on the hosted app",
        risk: "Risks 2 and 3: identity boundary",
        environment: "production",
        shows:
          "On the live app, a signed-out visitor is sent to sign-in, and private APIs refuse without a session or from another site.",
        limits:
          "Unauthenticated requests only. Signed-in isolation is shown on the local stack (SEC-02, SEC-03).",
      });
      try {
        const context = await browser.newContext({ ...MOBILE });
        const page = await context.newPage();
        await page.goto(`${PRODUCTION}/transactions`);
        await page.waitForLoadState("networkidle");
        ev.check(
          "Private page redirects to sign-in",
          `GET /transactions → ${new URL(page.url()).pathname}`,
          new URL(page.url()).pathname === "/sign-in",
        );
        await ev.shot(
          page,
          "signin",
          "monara-finance.vercel.app: a signed-out visit to /transactions lands on Sign in",
        );
        await context.close();
        const probes: [string, string, string, Record<string, string>][] = [
          [
            "Ledger API, no session",
            "POST",
            "/api/finance/operations/list_transactions",
            { Origin: PRODUCTION },
          ],
          [
            "Ledger API, another site",
            "POST",
            "/api/finance/operations/list_transactions",
            { Origin: "https://evil.example" },
          ],
          ["Chat history API, no session", "GET", "/api/chat/conversations", {}],
          ["Forecast API, no session", "GET", "/api/forecast", {}],
        ];
        for (const [label, method, path, headers] of probes) {
          const response = await request.fetch(`${PRODUCTION}${path}`, {
            method,
            headers: { "Content-Type": "application/json", ...headers },
            data: method === "POST" ? "{}" : undefined,
          });
          ev.request(label, method, path, response.status());
          ev.check(
            `${label}: refused`,
            `${method} ${path} → ${response.status()} ${await code(response)}`,
            response.status() === 401 || response.status() === 403,
          );
        }
      } finally {
        ev.finish();
      }
    });

    test("PROD-05 Hosted Agent routes require the secret", async ({ request }, info) => {
      const ev = new Evidence(info, {
        id: "PROD-05",
        title: "Hosted Agent routes require the secret",
        risk: "Risk 3: Agent-to-backend secret",
        environment: "production",
        shows:
          "On the live deployment, every Agent and Worker route refuses callers without the shared secret, or with a wrong one.",
        limits: "Only refusals are tested. The real secret is never used against production.",
      });
      try {
        for (const path of [
          "/api/agent/operations/list_transactions",
          "/api/agent/gmail/list-active-connections",
          "/api/agent/account-deletions/process",
          "/api/webhooks/composio",
        ]) {
          const response = await request.fetch(`${PRODUCTION}${path}`, {
            method: "POST",
            data: "{}",
            headers: { "Content-Type": "application/json", Authorization: "Bearer not-the-secret" },
          });
          ev.check(
            `Web ${path}: refused`,
            `POST with a wrong secret → ${response.status()} ${await code(response)}`,
            response.status() === 401,
          );
        }
        if (AGENT) {
          for (const path of ["/chat", "/gmail/sync", "/users/purge"]) {
            const response = await request.fetch(`${AGENT}${path}`, {
              method: "POST",
              data: "{}",
              headers: { "Content-Type": "application/json" },
            });
            ev.check(
              `Worker ${path}: refused`,
              `POST without the secret → ${response.status()}`,
              response.status() === 401,
            );
          }
          const health = await request.fetch(`${AGENT}/health`);
          ev.check(
            "Control: Worker is live",
            `GET /health → ${health.status()}`,
            health.status() === 200,
          );
        } else {
          ev.note(
            "Worker checks skipped",
            "E2E_PRODUCTION_AGENT_URL was not provided for this run",
          );
        }
      } finally {
        ev.finish();
      }
    });

    test("SEC-09 Security headers on the hosted app", async ({ request }, info) => {
      const ev = new Evidence(info, {
        id: "SEC-09",
        title: "Security headers on the hosted app",
        risk: "Risk 5: browser hardening",
        environment: "production",
        shows:
          "The live sign-in page sends HSTS, MIME-sniffing, framing, referrer and permission protections.",
        limits:
          "One page checked. A page-wide Content Security Policy is recorded as present or absent, not judged here.",
      });
      try {
        const response = await request.fetch(`${PRODUCTION}/sign-in`);
        const headers = response.headers();
        const expectations: [string, string, (value: string) => boolean][] = [
          ["HSTS", "strict-transport-security", (v) => /max-age=\d{7,}/.test(v)],
          ["No MIME sniffing", "x-content-type-options", (v) => v === "nosniff"],
          ["No framing", "x-frame-options", (v) => v.toUpperCase() === "DENY"],
          ["Referrer policy", "referrer-policy", (v) => v.length > 0],
          ["Permissions policy", "permissions-policy", (v) => v.includes("camera=()")],
          ["Private pages not cached", "cache-control", (v) => /no-store/.test(v)],
        ];
        for (const [label, name, valid] of expectations) {
          const value = headers[name] ?? "";
          ev.check(label, `${name}: ${value || "(missing)"}`, valid(value));
        }
        const csp = headers["content-security-policy"];
        if (csp)
          ev.check(
            "Content Security Policy present",
            `content-security-policy: ${csp.slice(0, 90)}${csp.length > 90 ? "…" : ""}`,
            true,
          );
        else
          ev.note(
            "No page-wide Content Security Policy",
            "content-security-policy: (missing). Documented open risk 5",
          );
        expect(response.status()).toBe(200);
      } finally {
        ev.finish();
      }
    });
  });
