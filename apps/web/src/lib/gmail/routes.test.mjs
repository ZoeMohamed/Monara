import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { describe, it } from "node:test";

const connectionId = "00000000-0000-4000-8000-000000000010";
const state = {
  user: { id: "00000000-0000-4000-8000-000000000001" },
  starts: [],
  completions: [],
  queued: [],
  requested: [],
  failures: [],
  discoveries: [],
  agentFails: false,
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
  async syncCounts() { return {imported:2,skipped:1,failed:0,inProgress:0,importedTransactions:2}; },
  async requestSync(userId, connectionId) {
    globalThis.monaraGmailRouteTest.requested.push({userId,connectionId});
    return "2026-10-16T07:30:00.000Z";
  },
  async failSync(input) { globalThis.monaraGmailRouteTest.failures.push(input); },
}; }
`;
const agentSync = `
export class AgentSyncError extends Error {}
export async function requestAgentSync(input) {
  if (globalThis.monaraGmailRouteTest.agentFails) throw new AgentSyncError();
  globalThis.monaraGmailRouteTest.queued.push(input);
}
export async function requestAgentDiscovery(connectionId) {
  if (globalThis.monaraGmailRouteTest.agentFails) throw new AgentSyncError();
  globalThis.monaraGmailRouteTest.discoveries.push(connectionId);
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
    if (specifier === "@/lib/gmail/agent-sync")
      return { url: `data:text/javascript,${encodeURIComponent(agentSync)}`, shortCircuit: true };
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
const { POST: sync } = await import("../../app/api/gmail/connections/[connectionId]/sync/route.ts");
hooks.deregister();

function withTunnel(run) {
  const previous = { mode: process.env.NODE_ENV, domain: process.env.NGROK_DOMAIN };
  process.env.NODE_ENV = "development";
  process.env.NGROK_DOMAIN = "example.ngrok-free.dev";
  state.starts = [];
  state.completions = [];
  state.queued = [];
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

  it("still connects when the agent cannot start account discovery", () =>
    withTunnel(async () => {
      state.agentFails = true;
      try {
        const request = new Request(
          "http://localhost:3005/api/gmail/connections/callback?session_uri=synthetic-twice",
          { headers: { host: "example.ngrok-free.dev" } },
        );
        request.nextUrl = new URL(request.url);
        const response = await callback(request);
        assert.match(response.headers.get("location"), /result=connected$/);
      } finally {
        state.agentFails = false;
      }
    }));
});

describe("Gmail Sync Now origin and cursor boundary", () => {
  it("refuses cross-site requests before queueing work", () =>
    withTunnel(async () => {
      const response = await sync(
        new Request(`https://monara.example/api/gmail/connections/${connectionId}/sync`, {
          method: "POST",
          headers: { origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
        }),
        { params: Promise.resolve({ connectionId }) },
      );
      assert.equal(response.status, 403);
      assert.deepEqual(state.queued, []);
    }));

  it("queues an owned active connection from its last successful cursor", () =>
    withTunnel(async () => {
      const response = await sync(
        new Request(`https://monara.example/api/gmail/connections/${connectionId}/sync`, {
          method: "POST",
          headers: { origin: "https://monara.example", "sec-fetch-site": "same-origin" },
        }),
        { params: Promise.resolve({ connectionId }) },
      );
      assert.equal(response.status, 202);
      assert.deepEqual(state.queued, [{ connectionId, since: "2026-10-14T04:00:00Z" }]);
      // The queued state is stored for the signed-in User before the agent is asked.
      assert.deepEqual(state.requested, [{ userId: state.user.id, connectionId }]);
      assert.equal((await response.json()).status, "queued");
    }));

  it("stores the failure when the agent cannot queue the sync", () =>
    withTunnel(async () => {
      state.agentFails = true;
      state.failures.length = 0;
      try {
        const response = await sync(
          new Request(`https://monara.example/api/gmail/connections/${connectionId}/sync`, {
            method: "POST",
            headers: { origin: "https://monara.example", "sec-fetch-site": "same-origin" },
          }),
          { params: Promise.resolve({ connectionId }) },
        );
        assert.equal((await response.json()).code, "DEPENDENCY_UNAVAILABLE");
        assert.deepEqual(state.failures, [
          {
            connectionId,
            error: "agent_unavailable",
            requestedAt: "2026-10-16T07:30:00.000Z",
          },
        ]);
      } finally {
        state.agentFails = false;
      }
    }));
});
