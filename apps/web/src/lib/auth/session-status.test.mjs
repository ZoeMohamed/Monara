import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, describe, it } from "node:test";
import { setupKeyForUser } from "./setup-key.ts";

const userId = "d1900000-0000-4000-8000-000000000001";
const claims = {
  sub: userId,
  aud: "authenticated",
  role: "authenticated",
  app_metadata: { provider: "google" },
};
const state = { claims, active: { data: true, error: null }, failure: null, rpcCalls: [] };
globalThis.monaraSessionStatusTest = state;

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const mocks = {
      "@monara/db": `
        export function createMonaraServerClient() {
          const state = globalThis.monaraSessionStatusTest;
          return {
            auth: { getClaims: async () => ({ data: { claims: state.claims }, error: null }) },
            async rpc(name) {
              state.rpcCalls.push(name);
              if (state.failure) throw state.failure;
              return state.active;
            },
          };
        }
      `,
      "next/headers": "export async function cookies() { return { getAll: () => [] }; }",
      "@/lib/supabase/config": `
        export const availablePublicSupabaseConfig = () => ({});
        export const publicSupabaseConfig = () => ({});
      `,
    };
    if (specifier in mocks) {
      return {
        url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`,
        shortCircuit: true,
      };
    }
    const aliases = {
      "@/lib/auth/identity": "./identity.ts",
      "@/lib/auth/setup-key": "./setup-key.ts",
      "@/lib/supabase/server": "../supabase/server.ts",
    };
    return nextResolve(
      specifier in aliases ? new URL(aliases[specifier], import.meta.url).href : specifier,
      context,
    );
  },
});
const { getAuthenticatedIdentity } = await import("../supabase/server.ts");
const { GET } = await import("../../app/api/profile/status/route.ts");
hooks.deregister();

beforeEach(() => {
  state.claims = claims;
  state.active = { data: true, error: null };
  state.failure = null;
  state.rpcCalls = [];
});

describe("live session status boundary", () => {
  it("returns the active identity's setup key without caching the response", async () => {
    assert.equal((await getAuthenticatedIdentity()).id, userId);
    const response = await GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), { setupKey: setupKeyForUser(userId) });
    assert.deepEqual(state.rpcCalls, ["monara_session_is_active", "monara_session_is_active"]);
  });

  it("reports a confirmed inactive identity as signed out", async () => {
    state.active = { data: false, error: null };
    assert.equal(await getAuthenticatedIdentity(), null);
    const response = await GET();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { setupKey: null });
  });

  it("reports missing identity as signed out without making an activity lookup", async () => {
    state.claims = null;
    const response = await GET();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { setupKey: null });
    assert.deepEqual(state.rpcCalls, []);
  });

  for (const failure of ["returned RPC error", "thrown network error"]) {
    it(`returns retryable HTTP 503 instead of signed out for a ${failure}`, async () => {
      if (failure === "returned RPC error") {
        state.active = { data: null, error: { message: "private backend details" } };
      } else state.failure = new Error("private backend details");
      await assert.rejects(() => getAuthenticatedIdentity());
      const response = await GET();
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.equal(response.headers.get("set-cookie"), null);
      assert.deepEqual(await response.json(), {
        message: "Session status is temporarily unavailable.",
      });

      // A later successful poll still recognizes the same signed-in User.
      state.active = { data: true, error: null };
      state.failure = null;
      const recovered = await GET();
      assert.equal(recovered.status, 200);
      assert.deepEqual(await recovered.json(), { setupKey: setupKeyForUser(userId) });
    });
  }
});
