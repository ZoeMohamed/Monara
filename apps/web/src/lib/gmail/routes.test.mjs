import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { describe, it } from "node:test";

const state = { user: { id: "00000000-0000-4000-8000-000000000001" }, starts: [], completions: [] };
globalThis.monaraGmailRouteTest = state;
const service = `
export const noStoreHeaders = { "Cache-Control": "no-store" };
export const errorResponse = (code, message) => Response.json({code,message},{status:code === "FORBIDDEN" ? 403 : 400,headers:noStoreHeaders});
export const unauthenticated = () => Response.json({code:"UNAUTHENTICATED"},{status:401,headers:noStoreHeaders});
export const gmailErrorResponse = () => Response.json({code:"DEPENDENCY_UNAVAILABLE"},{status:503,headers:noStoreHeaders});
export function gmailConnectionService() { return {
  async start(userId, callbackUrl) {
    globalThis.monaraGmailRouteTest.starts.push({userId,callbackUrl});
    return {redirectUrl:"https://connect.composio.dev/link/synthetic"};
  },
  async complete(userId, sessionUri) { globalThis.monaraGmailRouteTest.completions.push({userId,sessionUri}); },
}; }
`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/gmail/service")
      return { url: `data:text/javascript,${encodeURIComponent(service)}`, shortCircuit: true };
    if (specifier === "@/lib/supabase/server")
      return {
        url: `data:text/javascript,${encodeURIComponent("export async function getAuthenticatedIdentity() { return globalThis.monaraGmailRouteTest.user; }")}`,
        shortCircuit: true,
      };
    if (specifier === "@/lib/http/origin")
      return nextResolve(new URL("../http/origin.ts", import.meta.url).href, context);
    if (specifier === "@/lib/gmail/callback")
      return nextResolve(new URL("./callback.ts", import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
});
const { POST } = await import("../../app/api/gmail/connections/route.ts");
const { GET: callback } = await import("../../app/api/gmail/connections/callback/route.ts");
hooks.deregister();

function withTunnel(run) {
  const previous = { mode: process.env.NODE_ENV, domain: process.env.NGROK_DOMAIN };
  process.env.NODE_ENV = "development";
  process.env.NGROK_DOMAIN = "example.ngrok-free.dev";
  state.starts = [];
  state.completions = [];
  state.user = { id: "00000000-0000-4000-8000-000000000001" };
  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [key, value] of [
        ["NODE_ENV", previous.mode],
        ["NGROK_DOMAIN", previous.domain],
      ]) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

describe("Gmail route callback origin and session boundary", () => {
  it("starts consent with the verified User and public callback, never a forwarded host", () =>
    withTunnel(async () => {
      const response = await POST(
        new Request("http://0.0.0.0:3005/api/gmail/connections", {
          method: "POST",
          headers: {
            host: "example.ngrok-free.dev",
            "sec-fetch-site": "same-origin",
            "x-forwarded-host": "attacker.example",
          },
        }),
      );
      assert.equal(response.status, 200);
      assert.deepEqual(state.starts, [
        {
          userId: state.user.id,
          callbackUrl: "https://example.ngrok-free.dev/api/gmail/connections/callback",
        },
      ]);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }));

  it("refuses a localhost start or cross-site request before calling Composio", () =>
    withTunnel(async () => {
      const local = await POST(
        new Request("http://localhost:3005/api/gmail/connections", {
          method: "POST",
          headers: { "sec-fetch-site": "same-origin" },
        }),
      );
      assert.equal(local.status, 400);
      assert.equal((await local.json()).code, "VALIDATION_FAILED");
      const crossSite = await POST(
        new Request("http://0.0.0.0:3005/api/gmail/connections", {
          method: "POST",
          headers: { host: "example.ngrok-free.dev", "sec-fetch-site": "cross-site" },
        }),
      );
      assert.equal(crossSite.status, 403);
      assert.deepEqual(state.starts, []);
    }));

  it("requires the returning session and never accepts query connection ids as proof", () =>
    withTunnel(async () => {
      const request = new Request(
        "http://0.0.0.0:3005/api/gmail/connections/callback?connected_account_id=synthetic&user_id=attacker",
        {
          headers: { host: "example.ngrok-free.dev" },
        },
      );
      request.nextUrl = new URL(request.url);
      const response = await callback(request);
      assert.equal(response.status, 303);
      assert.equal(
        response.headers.get("location"),
        "https://example.ngrok-free.dev/connections/gmail?result=VALIDATION_FAILED",
      );
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.deepEqual(state.completions, []);
      state.user = null;
      const signedOut = await callback(request);
      assert.match(signedOut.headers.get("location"), /result=UNAUTHENTICATED$/);
      assert.deepEqual(state.completions, []);
    }));

  it("redeems the single-use session only for the returning signed-in User", () =>
    withTunnel(async () => {
      const request = new Request(
        "http://localhost:3005/api/gmail/connections/callback?session_uri=synthetic-once&user_id=attacker",
        {
          headers: { host: "example.ngrok-free.dev" },
        },
      );
      request.nextUrl = new URL(request.url);
      const response = await callback(request);
      assert.deepEqual(state.completions, [
        { userId: state.user.id, sessionUri: "synthetic-once" },
      ]);
      assert.equal(
        response.headers.get("location"),
        "https://example.ngrok-free.dev/connections/gmail?result=connected",
      );
      assert.equal(response.headers.get("cache-control"), "private, no-store");
    }));
});
