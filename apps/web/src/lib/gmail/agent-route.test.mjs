import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { describe, it } from "node:test";

const connectionId = "00000000-0000-4000-8000-000000000010";
const secret = "synthetic-agent-secret";
const state = { discovered: [] };
globalThis.monaraAgentRouteTest = state;

const service = `
export const noStoreHeaders = { "Cache-Control": "no-store" };
export const errorResponse = (code, message) =>
  Response.json({ code, message }, { status: code === "UNAUTHENTICATED" ? 401 : 400 });
export const gmailErrorResponse = (error) =>
  Response.json({ code: error?.code ?? "INTERNAL" }, { status: 500 });
export const gmailIngestionRepository = () => ({});
`;
const discovery = `
export async function runDiscovery(connectionId) {
  globalThis.monaraAgentRouteTest.discovered.push(connectionId);
}
`;
const finance = "export async function evaluateConfirmedGmailImports() {}";
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const mocks = {
      "@/lib/gmail/service": service,
      "@/lib/gmail/discovery": discovery,
      "@/lib/finance/service": finance,
    };
    if (specifier in mocks) {
      return {
        url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`,
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/agent/credential")
      return nextResolve(new URL("../agent/credential.ts", import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
});
const { POST } = await import("../../app/api/agent/gmail/[operation]/route.ts");
hooks.deregister();

function call(operation, body, authorization) {
  const headers = { "Content-Type": "application/json" };
  if (authorization) headers.Authorization = authorization;
  return POST(
    new Request(`https://web.example/api/agent/gmail/${operation}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ operation }) },
  );
}

describe("agent discover operation", () => {
  it("runs discovery in the web backend only for the agent's credential", async () => {
    const previous = process.env.MONARA_AGENT_BACKEND_SECRET;
    process.env.MONARA_AGENT_BACKEND_SECRET = secret;
    try {
      for (const authorization of [undefined, "Bearer wrong-secret"]) {
        const response = await call("discover", { connectionId }, authorization);
        assert.equal(response.status, 401);
      }
      assert.deepEqual(state.discovered, []);

      const response = await call("discover", { connectionId }, `Bearer ${secret}`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {});
      assert.deepEqual(state.discovered, [connectionId]);
    } finally {
      process.env.MONARA_AGENT_BACKEND_SECRET = previous;
    }
  });

  it("fails closed when the secret is not configured", async () => {
    const previous = process.env.MONARA_AGENT_BACKEND_SECRET;
    delete process.env.MONARA_AGENT_BACKEND_SECRET;
    try {
      const response = await call("discover", { connectionId }, "Bearer anything");
      assert.equal(response.status, 401);
    } finally {
      process.env.MONARA_AGENT_BACKEND_SECRET = previous;
    }
  });
});
