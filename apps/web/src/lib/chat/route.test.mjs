import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { describe, it } from "node:test";

const userId = "70000000-0000-4000-8000-000000000007";
const conversationId = "71000000-0000-4000-8000-000000000001";
const answer = { reply: "Done", actions: [], confirmation: null };
const state = { after: [], saves: [] };
globalThis.monaraChatRouteTest = state;

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const mocks = {
      "next/server": `export function after(callback) { globalThis.monaraChatRouteTest.after.push(callback); }`,
      "@/lib/chat/service": `
        export function chatHistoryService() {
          return {
            async saveExchange(...args) { globalThis.monaraChatRouteTest.saves.push(args); }
          };
        }
      `,
      "@/lib/supabase/server": `
        export async function getAuthenticatedIdentity() { return { id: ${JSON.stringify(userId)} }; }
      `,
    };
    if (specifier in mocks) {
      return {
        url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`,
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/http/origin") {
      return nextResolve(new URL("../http/origin.ts", import.meta.url).href, context);
    }
    if (specifier === "@/lib/http/rate-limit") {
      return nextResolve(new URL("../http/rate-limit.ts", import.meta.url).href, context);
    }
    return nextResolve(specifier, context);
  },
});
const { POST } = await import("../../app/api/chat/route.ts");
hooks.deregister();

describe("chat reply persistence boundary", () => {
  it("returns the verified Agent reply before saving history", async () => {
    const previousUrl = process.env.MONARA_AGENT_URL;
    const previousSecret = process.env.MONARA_AGENT_BACKEND_SECRET;
    const originalFetch = globalThis.fetch;
    process.env.MONARA_AGENT_URL = "https://agent.example";
    process.env.MONARA_AGENT_BACKEND_SECRET = "synthetic-secret";
    globalThis.fetch = async () => Response.json(answer);
    state.after = [];
    state.saves = [];
    try {
      const response = await POST(
        new Request("https://web.example/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
          body: JSON.stringify({ text: "log coffee", history: [], conversationId }),
        }),
      );
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), answer);
      assert.equal(state.saves.length, 0);
      assert.equal(state.after.length, 1);

      await state.after[0]();
      assert.equal(state.saves.length, 1);
      assert.equal(state.saves[0][0], userId);
      assert.equal(state.saves[0][1].conversationId, conversationId);
      assert.ok(state.saves[0][3] instanceof AbortSignal);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousUrl === undefined) delete process.env.MONARA_AGENT_URL;
      else process.env.MONARA_AGENT_URL = previousUrl;
      if (previousSecret === undefined) delete process.env.MONARA_AGENT_BACKEND_SECRET;
      else process.env.MONARA_AGENT_BACKEND_SECRET = previousSecret;
    }
  });

  it("refuses with a retry time once a User sends too many messages", async () => {
    const originalFetch = globalThis.fetch;
    const previousUrl = process.env.MONARA_AGENT_URL;
    const previousSecret = process.env.MONARA_AGENT_BACKEND_SECRET;
    process.env.MONARA_AGENT_URL = "https://agent.example";
    process.env.MONARA_AGENT_BACKEND_SECRET = "synthetic-secret";
    globalThis.fetch = async () => Response.json(answer);
    const { resetRateLimits, RATE_LIMITS } = await import("../http/rate-limit.ts");
    resetRateLimits();
    const send = () =>
      POST(
        new Request("https://web.example/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
          body: JSON.stringify({ text: "log coffee", history: [], conversationId }),
        }),
      );
    try {
      for (let i = 0; i < RATE_LIMITS.chat.limit; i++) assert.equal((await send()).status, 200);
      const refused = await send();
      assert.equal(refused.status, 429);
      assert.equal((await refused.json()).code, "RATE_LIMITED");
      assert.ok(Number(refused.headers.get("retry-after")) >= 1);
    } finally {
      resetRateLimits();
      globalThis.fetch = originalFetch;
      if (previousUrl === undefined) delete process.env.MONARA_AGENT_URL;
      else process.env.MONARA_AGENT_URL = previousUrl;
      if (previousSecret === undefined) delete process.env.MONARA_AGENT_BACKEND_SECRET;
      else process.env.MONARA_AGENT_BACKEND_SECRET = previousSecret;
    }
  });
});
