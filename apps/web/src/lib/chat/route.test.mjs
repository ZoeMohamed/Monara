import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { afterEach, beforeEach, describe, it } from "node:test";

const userId = "70000000-0000-4000-8000-000000000007";
const conversationId = "71000000-0000-4000-8000-000000000001";
const answer = { reply: "Done", actions: [], confirmation: null };
const state = { userId, saves: [], stored: new Map(), saveFailure: false, agentCalls: 0 };
globalThis.monaraChatRouteTest = state;

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const mocks = {
      "@/lib/chat/service": `
        export function chatHistoryService() {
          return {
            async saveExchange(...args) {
              const state = globalThis.monaraChatRouteTest;
              state.saves.push(args);
              const [owner, exchange] = args;
              state.stored.set(owner + ":" + exchange.exchangeId, exchange);
              if (state.saveFailure) throw new Error("Synthetic commit response lost");
            }
          };
        }
      `,
      "@/lib/supabase/server": `
        export async function getAuthenticatedIdentity() {
          const id = globalThis.monaraChatRouteTest.userId;
          return id ? { id } : null;
        }
      `,
      "@/lib/finance/service": `
        export function financeSuccessResponse(body) { return Response.json(body, {headers:{"Cache-Control":"private, no-store"}}); }
        export function financeErrorResponse(error) {
          const status = {FORBIDDEN:403, UNAUTHENTICATED:401, VALIDATION_FAILED:400}[error.code] || 503;
          return Response.json({code:error.code,message:error.message,requestId:null},{status,headers:{"Cache-Control":"private, no-store"}});
        }
      `,
    };
    if (specifier in mocks)
      return {
        url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`,
        shortCircuit: true,
      };
    const files = {
      "@/lib/http/origin": "../http/origin.ts",
      "@/lib/http/rate-limit": "../http/rate-limit.ts",
      "@/lib/chat/persist-exchange": "./persist-exchange.ts",
      "@/lib/chat/history-recovery": "./history-recovery.ts",
    };
    if (specifier in files)
      return nextResolve(new URL(files[specifier], import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
});
const { POST } = await import("../../app/api/chat/route.ts");
const { POST: RETRY } = await import("../../app/api/chat/conversations/retry/route.ts");
hooks.deregister();
const { resetRateLimits, RATE_LIMITS } = await import("../http/rate-limit.ts");
const originalFetch = globalThis.fetch;
const previousUrl = process.env.MONARA_AGENT_URL;
const previousSecret = process.env.MONARA_AGENT_BACKEND_SECRET;

function request(body, path = "/api/chat") {
  return new Request(`https://web.example${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
    body: JSON.stringify(body),
  });
}
const send = (historyRecovery = true) =>
  POST(
    request({
      text: "log coffee",
      history: [],
      conversationId,
      ...(historyRecovery ? { historyRecovery: true } : {}),
    }),
  );

beforeEach(() => {
  resetRateLimits();
  Object.assign(state, { userId, saves: [], stored: new Map(), saveFailure: false, agentCalls: 0 });
  process.env.MONARA_AGENT_URL = "https://agent.example";
  process.env.MONARA_AGENT_BACKEND_SECRET = "synthetic-secret";
  globalThis.fetch = async () => {
    state.agentCalls += 1;
    return Response.json(answer);
  };
});
afterEach(() => {
  resetRateLimits();
  globalThis.fetch = originalFetch;
  if (previousUrl === undefined) delete process.env.MONARA_AGENT_URL;
  else process.env.MONARA_AGENT_URL = previousUrl;
  if (previousSecret === undefined) delete process.env.MONARA_AGENT_BACKEND_SECRET;
  else process.env.MONARA_AGENT_BACKEND_SECRET = previousSecret;
});

describe("chat reply persistence boundary", () => {
  it("acknowledges a saved verified answer and uses the signed-in owner", async () => {
    const response = await send();
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.reply, answer.reply);
    assert.equal(body.historySave.status, "saved");
    assert.equal(state.agentCalls, 1);
    assert.equal(state.saves.length, 1);
    assert.equal(state.saves[0][0], userId);
    assert.equal(state.saves[0][1].conversationId, conversationId);
    assert.equal(state.saves[0][1].exchangeId, body.historySave.exchangeId);
    assert.ok(state.saves[0][2] instanceof AbortSignal);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  });

  it("recovers a lost history commit response without replaying the Agent or duplicating an exchange", async () => {
    state.saveFailure = true;
    const response = await send();
    const body = await response.json();
    assert.equal(body.reply, answer.reply);
    assert.equal(body.historySave.status, "pending");
    state.saveFailure = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      const retry = await RETRY(
        request({ recoveryToken: body.historySave.recoveryToken }, "/api/chat/conversations/retry"),
      );
      assert.equal(retry.status, 200);
      assert.deepEqual(await retry.json(), {
        status: "saved",
        exchangeId: body.historySave.exchangeId,
      });
    }
    assert.equal(state.agentCalls, 1);
    assert.equal(state.stored.size, 1);
    assert.equal(state.saves.length, 3);
    assert.equal(state.saves[0][1].exchangeId, state.saves[2][1].exchangeId);
  });

  it("keeps the strict legacy reply shape for older open tabs", async () => {
    const response = await send(false);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), answer);
    assert.equal(state.saves.length, 1);
  });

  it("refuses unverified, oversized, cross-user and signed-out save attempts before storage", async () => {
    state.saveFailure = true;
    const { historySave } = await (await send()).json();
    state.saves = [];
    state.agentCalls = 0;
    for (const token of ["forged", "x".repeat(210_001)])
      assert.ok((await RETRY(request({ recoveryToken: token }))).status >= 400);
    state.userId = "70000000-0000-4000-8000-000000000008";
    assert.equal((await RETRY(request({ recoveryToken: historySave.recoveryToken }))).status, 403);
    state.userId = null;
    assert.equal((await RETRY(request({ recoveryToken: historySave.recoveryToken }))).status, 401);
    assert.equal(state.saves.length, 0);
    assert.equal(state.agentCalls, 0);
  });

  it("refuses with a retry time once a User sends too many messages", async () => {
    for (let i = 0; i < RATE_LIMITS.chat.limit; i++) assert.equal((await send()).status, 200);
    const refused = await send();
    assert.equal(refused.status, 429);
    assert.equal((await refused.json()).code, "RATE_LIMITED");
    assert.ok(Number(refused.headers.get("retry-after")) >= 1);
  });
});
