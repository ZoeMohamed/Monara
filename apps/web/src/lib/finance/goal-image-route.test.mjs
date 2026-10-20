import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { beforeEach, it } from "node:test";
import { FinanceOperationError } from "../../../../../packages/core/src/finance.ts";

const userId = "d1900000-0000-4000-8000-000000000001";
const goalId = "d1900000-0000-4000-8000-000000000021";
const version = "2026-10-19T00:00:00.000Z";
const oldImage = `${userId}/${goalId}/d1900000-0000-4000-8000-000000000031.png`;
const state = {};
globalThis.monaraGoalImageRouteTest = state;

const actualCore = new URL("../../../../../packages/core/src/finance.ts", import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    const mocks = {
      "@monara/core": `export { FinanceOperationError } from ${JSON.stringify(actualCore)};`,
      "@/lib/auth/user-deletion": `
        import { FinanceOperationError } from ${JSON.stringify(actualCore)};
        export async function requireActiveUser(userId) {
          const state = globalThis.monaraGoalImageRouteTest;
          state.activityChecks.push(userId);
          if (!state.active) throw new FinanceOperationError("UNAUTHENTICATED", "This account is no longer available.");
        }
      `,
      "@/lib/supabase/server": `
        export async function getAuthenticatedIdentity() { return globalThis.monaraGoalImageRouteTest.identity; }
        export async function createServerSupabaseClient() { return globalThis.monaraGoalImageRouteTest.authenticatedClient; }
      `,
      "@/lib/goals/service": `
        export function goalImageBackend() { return globalThis.monaraGoalImageRouteTest.backend; }
      `,
      "@/lib/finance/service": `
        export function financeSuccessResponse(body) { return Response.json(body, {headers:{"Cache-Control":"private, no-store"}}); }
        export function financeErrorResponse(error) {
          const status = {FORBIDDEN:403, UNAUTHENTICATED:401, VALIDATION_FAILED:400, NOT_FOUND:404, CONFLICT:409}[error.code] || 503;
          return Response.json({code:error.code, message:error.message}, {status, headers:{"Cache-Control":"private, no-store"}});
        }
      `,
    };
    if (specifier in mocks)
      return {
        url: `data:text/javascript,${encodeURIComponent(mocks[specifier])}`,
        shortCircuit: true,
      };
    const files = {
      "@/lib/goals/image": "../goals/image.ts",
      "@/lib/http/origin": "../http/origin.ts",
    };
    if (specifier in files)
      return nextResolve(new URL(files[specifier], import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
});
const { GET, POST } = await import("../../app/api/goals/[goalId]/image/route.ts");
hooks.deregister();

beforeEach(() => {
  Object.assign(state, {
    identity: { id: userId },
    active: true,
    uploads: [],
    removals: [],
    writes: [],
    activityChecks: [],
    deleteDuringUpload: false,
    uploadFailure: false,
    uploadResponseLost: false,
    visibleAfterLostResponse: false,
    settlementUnavailable: false,
    registrationFailure: false,
    intents: [],
    settled: [],
    cancelled: [],
    writeFailure: false,
    goal: { id: goalId, imagePath: oldImage, deletedAt: null, updatedAt: version },
  });
  state.authenticatedClient = {
    storage: {
      from(bucket) {
        assert.equal(bucket, "goal-images");
        return {
          async upload(path, bytes, options) {
            state.uploads.push({ path, bytes, options });
            if (state.deleteDuringUpload) state.active = false;
            if (state.uploadResponseLost) throw new TypeError("Synthetic upload response lost");
            return {
              data: null,
              error: state.uploadFailure
                ? Object.assign(new Error("Synthetic upload failure"), {
                    name: "StorageApiError",
                    status: 403,
                  })
                : null,
            };
          },
        };
      },
    },
  };
  state.backend = {
    client: {
      storage: {
        from(bucket) {
          assert.equal(bucket, "goal-images");
          return {
            async info() {
              return {
                data: state.visibleAfterLostResponse
                  ? { name: "Synthetic completed object" }
                  : null,
                error: null,
              };
            },
            async createSignedUrl(path, lifetime) {
              assert.equal(path, oldImage);
              assert.equal(lifetime, 60);
              return {
                data: { signedUrl: "https://storage.test/synthetic-private-photo" },
                error: null,
              };
            },
            upload() {
              throw new Error("Service-role uploads must never bypass Storage RLS");
            },
            async remove(paths) {
              state.removals.push(paths);
              return { data: [], error: null };
            },
          };
        },
      },
    },
    repository: {
      async findFinancialGoal(owner, requestedGoal) {
        assert.equal(owner, userId);
        assert.equal(requestedGoal, goalId);
        return state.goal;
      },
      async setFinancialGoalImage(input) {
        state.writes.push(input);
        if (state.writeFailure) throw new FinanceOperationError("CONFLICT", "That Goal changed.");
        return { ...state.goal, imagePath: input.imagePath };
      },
    },
    uploads: {
      async begin(input) {
        assert.equal(
          state.uploads.length,
          state.intents.length,
          "each request registers its intent before starting its upload",
        );
        state.intents.push(input);
        if (state.registrationFailure) throw new Error("Synthetic registration response lost");
      },
      async cancelUnstarted(input) {
        assert.equal(
          state.uploads.length,
          0,
          "cancellation is valid only before attempting Storage",
        );
        state.cancelled.push(input);
      },
      async settle(input) {
        if (state.settlementUnavailable) throw new Error("Synthetic settlement unavailable");
        state.settled.push(input);
      },
    },
  };
});

function upload(expected = version, site = "same-origin") {
  const form = new FormData();
  form.set("expectedUpdatedAt", expected);
  form.set(
    "image",
    new File([Uint8Array.from([0xff, 0xd8, 0xff])], "goal.jpg", { type: "image/jpeg" }),
  );
  return POST(
    new Request(`http://localhost:3000/api/goals/${goalId}/image`, {
      method: "POST",
      headers: { "sec-fetch-site": site, "content-length": "1000" },
      body: form,
    }),
    { params: Promise.resolve({ goalId }) },
  );
}

it("uploads under the signed-in Storage policy, then saves an owned version and removes the previous image", async () => {
  const response = await upload();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(state.uploads.length, 1);
  assert.ok(state.uploads[0].path.startsWith(`${userId}/${goalId}/`));
  assert.equal(state.uploads[0].options.upsert, false);
  assert.equal(state.uploads[0].options.cacheControl, "0");
  assert.equal(state.intents.length, 1);
  assert.equal(state.intents[0].objectPath, state.uploads[0].path);
  assert.equal(state.settled[0].uploadId, state.intents[0].uploadId);
  assert.deepEqual(state.activityChecks, [userId, userId]);
  assert.equal(state.writes[0].userId, userId);
  assert.equal(state.writes[0].expectedUpdatedAt, version);
  assert.deepEqual(state.removals, [[oldImage]]);
});

it("does not cache the redirect to a short-lived private image", async () => {
  const response = await GET(new Request(`http://localhost:3000/api/goals/${goalId}/image`), {
    params: Promise.resolve({ goalId }),
  });
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("location"), "https://storage.test/synthetic-private-photo");
});

it("blocks cross-origin, missing owned Goals, stale versions and deleting identities before uploading bytes", async () => {
  assert.equal((await upload(version, "cross-site")).status, 403);
  state.goal = null;
  assert.equal((await upload()).status, 404);
  state.goal = {
    id: goalId,
    imagePath: oldImage,
    deletedAt: null,
    updatedAt: "2026-10-19T01:00:00Z",
  };
  assert.equal((await upload()).status, 409);
  state.goal.updatedAt = version;
  state.active = false;
  assert.equal((await upload()).status, 401);
  assert.deepEqual(state.uploads, []);
  assert.deepEqual(state.writes, []);
});

it("compensates an upload accepted while account deletion starts and never saves its Goal reference", async () => {
  state.deleteDuringUpload = true;
  assert.equal((await upload()).status, 401);
  assert.equal(state.uploads.length, 1);
  assert.deepEqual(state.writes, []);
  assert.deepEqual(state.removals, [[state.uploads[0].path]]);
});

it("compensates uncertain upload errors and failed Goal writes without removing the previous image", async () => {
  state.uploadFailure = true;
  assert.equal((await upload()).status, 503);
  assert.deepEqual(state.writes, []);
  assert.deepEqual(state.removals, [[state.uploads[0].path]]);
  state.uploadFailure = false;
  state.writeFailure = true;
  assert.equal((await upload()).status, 409);
  assert.deepEqual(state.removals, [[state.uploads[0].path], [state.uploads[1].path]]);
});

it("keeps an interrupted upload pending when its completion cannot be established", async () => {
  state.uploadResponseLost = true;
  assert.equal((await upload()).status, 503);
  assert.deepEqual(state.writes, []);
  assert.deepEqual(state.settled, []);
  assert.deepEqual(state.removals, []);
  assert.deepEqual(
    state.cancelled,
    [],
    "an attempted upload must never use unstarted cancellation",
  );
});

it("closes an interrupted registration before any image request starts", async () => {
  state.registrationFailure = true;
  assert.equal((await upload()).status, 503);
  assert.deepEqual(state.uploads, []);
  assert.deepEqual(state.writes, []);
  assert.deepEqual(state.cancelled, state.intents);
  assert.deepEqual(state.removals, []);
});

it("reconciles an interrupted response from visible object metadata before compensating its upload", async () => {
  state.uploadResponseLost = true;
  state.visibleAfterLostResponse = true;
  assert.equal((await upload()).status, 503);
  assert.deepEqual(state.writes, []);
  assert.equal(state.settled.length, 1);
  assert.deepEqual(state.removals, [[state.uploads[0].path]]);
});

it("retains a known uploaded object if durable settlement cannot be confirmed", async () => {
  state.settlementUnavailable = true;
  assert.equal((await upload()).status, 503);
  assert.deepEqual(state.writes, []);
  assert.deepEqual(state.settled, []);
  assert.deepEqual(state.removals, []);
});
