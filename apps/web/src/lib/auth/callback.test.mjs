import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, describe, it } from "node:test";

const claims = {
  sub: "d1900000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  app_metadata: { provider: "google" },
};
const state = {
  claims,
  active: { data: true, error: null },
  failure: null,
  signOuts: [],
  deleted: [],
};
globalThis.monaraCallbackTest = state;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const mocks = {
      "next/server": "export class NextResponse extends Response {}",
      "next/headers": `export async function cookies() {
        return { delete: name => globalThis.monaraCallbackTest.deleted.push(name) };
      }`,
      "@/lib/supabase/server": `export async function createServerSupabaseClient() {
        const state = globalThis.monaraCallbackTest;
        return {
          auth: {
            exchangeCodeForSession: async () => ({ error: null }),
            getClaims: async () => ({ data: { claims: state.claims }, error: null }),
            signOut: async options => state.signOuts.push(options),
          },
          async rpc() {
            if (state.failure) throw state.failure;
            return state.active;
          },
        };
      }`,
    };
    if (specifier in mocks) {
      return {
        url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`,
        shortCircuit: true,
      };
    }
    if (specifier.startsWith("@/lib/auth/")) {
      return nextResolve(
        new URL(`./${specifier.split("/").at(-1)}.ts`, import.meta.url).href,
        context,
      );
    }
    return nextResolve(specifier, context);
  },
});
const { GET } = await import("../../app/auth/callback/route.ts");
hooks.deregister();

beforeEach(() => {
  state.claims = claims;
  state.active = { data: true, error: null };
  state.failure = null;
  state.signOuts = [];
  state.deleted = [];
});

async function callback() {
  const url = new URL("https://monara.example/auth/callback?code=synthetic&next=%2Fprofile");
  const response = await GET({ url: url.href, nextUrl: url });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  return new URL(response.headers.get("location"), url);
}

describe("OAuth callback session activity", () => {
  for (const failure of ["returned RPC error", "thrown network error"]) {
    it(`preserves the exchanged session on a ${failure}`, async () => {
      if (failure === "returned RPC error")
        state.active = { data: null, error: { message: "outage" } };
      else state.failure = new Error("outage");
      const destination = await callback();
      assert.equal(destination.pathname, "/sign-in");
      assert.equal(destination.searchParams.get("error"), "oauth_callback_failed");
      assert.equal(destination.searchParams.get("next"), "/profile");
      assert.deepEqual(state.signOuts, []);
      assert.deepEqual(state.deleted, []);
    });
  }

  for (const invalid of ["inactive identity", "invalid claims"]) {
    it(`signs out and rejects an ${invalid}`, async () => {
      if (invalid === "inactive identity") state.active = { data: false, error: null };
      else state.claims = { ...claims, app_metadata: {} };
      const destination = await callback();
      assert.equal(destination.searchParams.get("error"), "session_invalid");
      assert.deepEqual(state.signOuts, [{ scope: "local" }]);
    });
  }

  it("accepts an active identity and clears the old deletion receipt", async () => {
    const destination = await callback();
    assert.equal(destination.pathname, "/profile");
    assert.deepEqual(state.signOuts, []);
    assert.equal(state.deleted.length, 1);
  });
});
