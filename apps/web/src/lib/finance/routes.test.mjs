import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { describe, it } from "node:test";

import { FinanceOperationError } from "../../../../../packages/core/src/finance.ts";

const ownerId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const actionId = "00000000-0000-4000-8000-000000000501";
const transactionId = "00000000-0000-4000-8000-000000000301";
const version = "2026-10-17T10:00:00Z";
const state = {
  identity: { id: ownerId },
  action: null,
  lookups: [],
  writes: [],
  stale: false,
};
state.repository = {
  async findUndoAction(userId, requestedActionId) {
    state.lookups.push({ userId, actionId: requestedActionId });
    return userId === ownerId && requestedActionId === actionId ? state.action : null;
  },
  async softDeleteTransaction(input) {
    if (state.stale) throw new FinanceOperationError("CONFLICT", "This transaction changed.");
    state.writes.push(input);
  },
  async consumeUndoAction() {
    if (!state.action || state.action.consumedAt) return false;
    state.action.consumedAt = new Date().toISOString();
    return true;
  },
};
globalThis.monaraFinanceRouteTest = state;

const actualCore = new URL("../../../../../packages/core/src/finance.ts", import.meta.url).href;
const mockCore = `
  export { createFinanceService, FinanceOperationError } from ${JSON.stringify(actualCore)};
  export const createSupabaseFinanceRepository = () => globalThis.monaraFinanceRouteTest.repository;
`;
const mockDb = "export const createMonaraServiceRoleClient = () => ({});";
const mockConfig = "export const publicSupabaseConfig = () => ({});";
const mockNextServer = "export const after = () => {};";
const mockGmailImport = "export async function importAfterAccountLinked() {}";
const mockGmailTrigger = "export async function syncUserTriggers() {}";
const mockBudgetAlerts = "export function scheduleBudgetAlert() {}";
const mockIdentity =
  "export async function getAuthenticatedIdentity() { return globalThis.monaraFinanceRouteTest.identity; }";
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const mocks = {
      "@monara/core": mockCore,
      "@monara/db": mockDb,
      "next/server": mockNextServer,
      "@/lib/gmail/import": mockGmailImport,
      "@/lib/gmail/trigger": mockGmailTrigger,
      "@/lib/whatsapp/budget-alerts": mockBudgetAlerts,
      "@/lib/forecast/service":
        'export function forecastService() { throw new Error("not used here"); }',
      "@/lib/supabase/config": mockConfig,
      "@/lib/supabase/server": mockIdentity,
    };
    if (specifier in mocks) {
      return {
        url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`,
        shortCircuit: true,
      };
    }
    if (specifier === "@/lib/finance/service") {
      return nextResolve(new URL("./service.ts", import.meta.url).href, context);
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
const { POST } = await import("../../app/api/finance/operations/[operation]/route.ts");
const { isFinanceOperation, isAgentOperation, runAgentOperation } = await import("./service.ts");
hooks.deregister();

function reset() {
  state.identity = { id: ownerId };
  state.action = {
    id: actionId,
    resourceType: "transaction",
    resourceId: transactionId,
    expiresAt: "2099-10-17T10:30:00Z",
    consumedAt: null,
    state: { operation: "delete_created_transaction", expectedUpdatedAt: version },
  };
  state.lookups = [];
  state.writes = [];
  state.stale = false;
}

function undo(input = { actionId }, site = "same-origin") {
  return POST(
    new Request("http://localhost:3000/api/finance/operations/undo_action", {
      method: "POST",
      headers: { "sec-fetch-site": site, "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
    { params: Promise.resolve({ operation: "undo_action" }) },
  );
}

describe("owned web Undo boundary", () => {
  it("exposes the existing owned reversal through web and Agent dispatch", async () => {
    reset();
    assert.equal(isFinanceOperation("undo_action"), true);
    assert.equal(isAgentOperation("undo_action"), true);
    const response = await undo();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), { ok: true });
    assert.deepEqual(state.lookups, [{ userId: ownerId, actionId }]);
    assert.equal(state.writes.length, 1);
    assert.equal(state.writes[0].userId, ownerId);
    assert.equal(state.writes[0].transactionId, transactionId);
    assert.equal(state.writes[0].expectedUpdatedAt, version);

    reset();
    assert.deepEqual(
      await runAgentOperation(
        "undo_action",
        {
          userId: ownerId,
          channel: "web",
          directSource: "web_chat",
        },
        { actionId },
      ),
      { ok: true },
    );
    assert.equal(state.writes.length, 1);
  });

  it("requires cookie identity and same-origin authorization before accessing any receipt", async () => {
    reset();
    const crossSite = await undo({ actionId }, "cross-site");
    assert.equal(crossSite.status, 403);
    state.identity = null;
    const signedOut = await undo();
    assert.equal(signedOut.status, 401);
    assert.equal(state.lookups.length, 0);
    assert.equal(state.writes.length, 0);

    state.identity = { id: otherId };
    const anotherOwner = await undo();
    assert.equal(anotherOwner.status, 404);
    assert.deepEqual(state.lookups, [{ userId: otherId, actionId }]);
    assert.equal(state.writes.length, 0);
  });

  it("rejects body-supplied identity and expired or consumed receipts without replaying a write", async () => {
    reset();
    const spoofed = await undo({ actionId, userId: ownerId });
    assert.equal(spoofed.status, 400);
    assert.equal(state.lookups.length, 0);
    state.action.expiresAt = "2000-01-01T00:00:00Z";
    assert.equal((await undo()).status, 409);
    assert.equal(state.writes.length, 0);

    reset();
    assert.equal((await undo()).status, 200);
    const repeated = await undo();
    assert.equal(repeated.status, 409);
    assert.equal((await repeated.json()).message, "That change was already undone.");
    assert.equal(state.writes.length, 1);
  });

  it("preserves a newer edit when the Undo receipt carries an old version", async () => {
    reset();
    state.stale = true;
    const response = await undo();
    assert.equal(response.status, 409);
    assert.equal(state.action.consumedAt, null);
    assert.equal(state.writes.length, 0);
  });

  it("refuses with Retry-After once a User sends too many operations", async () => {
    const { resetRateLimits, RATE_LIMITS } = await import("../http/rate-limit.ts");
    resetRateLimits();
    try {
      reset();
      for (let sent = 0; sent < RATE_LIMITS.finance.limit; sent++) {
        assert.notEqual((await undo()).status, 429);
      }
      const refused = await undo();
      assert.equal(refused.status, 429);
      assert.equal((await refused.json()).code, "RATE_LIMITED");
      assert.ok(Number(refused.headers.get("retry-after")) >= 1);
      assert.equal(refused.headers.get("cache-control"), "private, no-store");
    } finally {
      resetRateLimits();
    }
  });
});
