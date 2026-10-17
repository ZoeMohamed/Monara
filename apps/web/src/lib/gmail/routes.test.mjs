import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { describe, it } from "node:test";

const connectionId = "00000000-0000-4000-8000-000000000010";
const state = {
  user: { id: "00000000-0000-4000-8000-000000000001" },
  starts: [],
  completions: [],
  discoveries: [],
  inlineDiscoveries: [],
  discoveryState: "completed",
  discoveryFails: false,
};
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
  async complete(userId, sessionUri) {
    globalThis.monaraGmailRouteTest.completions.push({userId,sessionUri});
    return {id:"${connectionId}",status:"active"};
  },
  async list() { return [{id:"${connectionId}",status:"active",lastSyncedAt:"2026-10-14T04:00:00Z"}]; },
}; }
export function gmailIngestionRepository() { return {
  async discoveryFor(userId, connectionId) {
    if (userId !== globalThis.monaraGmailRouteTest.user.id || connectionId !== "${connectionId}") {
      throw Object.assign(new Error("not found"), { code: "NOT_FOUND" });
    }
    return { state: globalThis.monaraGmailRouteTest.discoveryState, suggestions: [] };
  },
}; }
`;
const discovery = `
export function startDiscoveryAfterResponse(connectionId) {
  globalThis.monaraGmailRouteTest.discoveries.push(connectionId);
}
export async function runDiscovery(connectionId) {
  globalThis.monaraGmailRouteTest.inlineDiscoveries.push(connectionId);
  if (globalThis.monaraGmailRouteTest.discoveryFails) throw new Error("gmail down");
  globalThis.monaraGmailRouteTest.discoveryState = "completed";
}
export async function rerunDiscoveryIfNeeded(connectionId) {
  const state = globalThis.monaraGmailRouteTest.discoveryState;
  if (state !== "idle" && state !== "failed") return false;
  await runDiscovery(connectionId).catch(() => undefined);
  return true;
}
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
    if (specifier === "@/lib/gmail/trigger")
      return {
        url: `data:text/javascript,${encodeURIComponent("export function syncTriggersAfterResponse() {}")}`,
        shortCircuit: true,
      };
    if (specifier === "@/lib/gmail/discovery")
      return { url: `data:text/javascript,${encodeURIComponent(discovery)}`, shortCircuit: true };
    if (specifier === "@/lib/http/origin")
      return nextResolve(new URL("../http/origin.ts", import.meta.url).href, context);
    if (specifier === "@/lib/onboarding/flow")
      return nextResolve(new URL("../onboarding/flow.ts", import.meta.url).href, context);
    if (specifier === "@/lib/gmail/callback")
      return nextResolve(new URL("./callback.ts", import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
});
const { POST } = await import("../../app/api/gmail/connections/route.ts");
const { GET: callback } = await import("../../app/api/gmail/connections/callback/route.ts");
const discoveryRoute = await import(
  "../../app/api/gmail/connections/[connectionId]/discovery/route.ts"
);
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
      // Account discovery starts for the connection the server just confirmed.
      assert.deepEqual(state.discoveries, [connectionId]);
    }));

  it("returns to Home when first-run setup started the connection, then clears the marker", () =>
    withTunnel(async () => {
      const request = new Request(
        "http://localhost:3005/api/gmail/connections/callback?session_uri=synthetic-setup",
        { headers: { host: "example.ngrok-free.dev", cookie: "a=b; monara-onboarding=1" } },
      );
      request.nextUrl = new URL(request.url);
      const response = await callback(request);
      assert.equal(
        response.headers.get("location"),
        "https://example.ngrok-free.dev/?gmail=connected",
      );
      assert.match(response.headers.get("set-cookie"), /^monara-onboarding=; .*Max-Age=0/);
      const other = new Request(
        "http://localhost:3005/api/gmail/connections/callback?session_uri=synthetic-profile",
        { headers: { host: "example.ngrok-free.dev", cookie: "monara-onboarding=0" } },
      );
      other.nextUrl = new URL(other.url);
      const profile = await callback(other);
      assert.match(profile.headers.get("location"), /\/connections\/gmail\?result=connected$/);
      assert.equal(profile.headers.get("set-cookie"), null);
    }));
});

describe("Gmail account discovery in the web backend", () => {
  const context = { params: Promise.resolve({ connectionId }) };
  const sameOrigin = () =>
    new Request(`http://localhost:3005/api/gmail/connections/${connectionId}/discovery`, {
      method: "POST",
      headers: { host: "localhost:3005", origin: "http://localhost:3005" },
    });

  it("reruns a discovery that never ran or failed before answering", async () => {
    for (const before of ["idle", "failed"]) {
      state.discoveryState = before;
      state.inlineDiscoveries = [];
      const response = await discoveryRoute.GET(new Request("http://localhost/x"), context);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).state, "completed");
      assert.deepEqual(state.inlineDiscoveries, [connectionId]);
    }
  });

  it("answers a finished or running discovery without searching again", async () => {
    for (const current of ["completed", "running"]) {
      state.discoveryState = current;
      state.inlineDiscoveries = [];
      const response = await discoveryRoute.GET(new Request("http://localhost/x"), context);
      assert.equal((await response.json()).state, current);
      assert.deepEqual(state.inlineDiscoveries, []);
    }
  });

  it("searches only the signed-in User's own connection", async () => {
    state.discoveryState = "idle";
    state.inlineDiscoveries = [];
    const other = {
      params: Promise.resolve({ connectionId: "00000000-0000-4000-8000-000000000099" }),
    };
    const response = await discoveryRoute.GET(new Request("http://localhost/x"), other);
    assert.notEqual(response.status, 200);
    assert.deepEqual(state.inlineDiscoveries, []);
    state.discoveryState = "completed";
  });

  it("searches again on request and answers with the result", async () => {
    state.discoveryState = "failed";
    state.inlineDiscoveries = [];
    const response = await discoveryRoute.POST(sameOrigin(), context);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).state, "completed");
    assert.deepEqual(state.inlineDiscoveries, [connectionId]);
  });

  it("reports an unavailable inbox when the requested search fails", async () => {
    state.discoveryFails = true;
    try {
      const response = await discoveryRoute.POST(sameOrigin(), context);
      assert.equal((await response.json()).code, "DEPENDENCY_UNAVAILABLE");
    } finally {
      state.discoveryFails = false;
      state.discoveryState = "completed";
    }
  });
});
