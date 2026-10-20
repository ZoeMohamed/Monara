import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { describe, it } from "node:test";
import { FinanceClientError } from "../finance/client.ts";
import {
  executeGoalSave,
  goalEditorAvailability,
  goalHasDraftSettings,
  newGoalSession,
  prepareGoalRequest,
} from "./draft.ts";

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith("/goals/client.ts") && specifier === "@/lib/finance/client")
      return nextResolve(new URL("../finance/client.ts", import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
});
const { uploadGoalImage } = await import("./client.ts");
hooks.deregister();

const goal = {
  id: "a1000000-0000-4000-8000-000000000001",
  name: "Laptop",
  target: { amountMinor: "12000000", currency: "IDR" },
  saved: { amountMinor: "6000000", currency: "IDR" },
  targetDate: "2027-04-19",
  status: "active",
  imagePath: null,
  deletedAt: null,
  createdAt: "2026-10-19T00:00:00Z",
  updatedAt: "2026-10-19T00:00:00Z",
};
const draft = () => {
  const session = newGoalSession(null, "2026-10-19");
  return {
    ...session,
    draft: {
      ...session.draft,
      name: goal.name,
      target: goal.target.amountMinor,
      saved: goal.saved.amountMinor,
      targetDate: goal.targetDate,
    },
  };
};

describe("retained goal save recovery", () => {
  it("retries a lost create reply with its original body and UUID after the editor is reopened", async () => {
    let retained = draft();
    const created = new Map();
    const attempts = [];
    const dependencies = {
      keep: (next) => {
        retained = next;
      },
      async saveFields(request) {
        attempts.push(structuredClone(request));
        const id = request.input.clientRequestId;
        created.set(id, goal);
        if (attempts.length === 1)
          throw new FinanceClientError(
            "DEPENDENCY_UNAVAILABLE",
            "Synthetic lost reply",
            null,
            true,
          );
        return created.get(id);
      },
      async savePhoto() {
        assert.fail("No photo was selected");
      },
    };
    assert.equal(await executeGoalSave(retained, dependencies), null);
    assert.equal(retained.pending, false);
    assert.equal(retained.uncertain, true);
    const request = retained.request;
    assert.equal(goalEditorAvailability(retained, undefined, true).blocked, true);
    assert.equal(goalEditorAvailability(retained, undefined, false).locked, true);
    assert.equal(goalEditorAvailability(retained, undefined, false).blocked, false);
    // A different route/editor can recover this same app-session object without preparing another request.
    const reopened = { ...retained };
    assert.equal(await executeGoalSave(reopened, dependencies), goal);
    assert.deepEqual(attempts[1], attempts[0]);
    assert.equal(retained.request, request);
    assert.equal(created.size, 1);
  });

  it("keeps a saved goal's exact version and retries only its photo after a lost upload reply", async () => {
    const photo = new File([new Uint8Array([0xff, 0xd8, 0xff])], "goal.jpg", {
      type: "image/jpeg",
    });
    let retained = draft();
    retained.draft.image = photo;
    let fields = 0;
    const photoVersions = [];
    const uploaded = {
      ...goal,
      updatedAt: "2026-10-19T00:01:00Z",
      imagePath: "synthetic/private/image.jpg",
    };
    const dependencies = {
      keep: (next) => {
        retained = next;
      },
      async saveFields() {
        fields += 1;
        return goal;
      },
      async savePhoto(saved, file) {
        assert.equal(file, photo);
        photoVersions.push(saved.updatedAt);
        if (photoVersions.length === 1)
          throw new FinanceClientError(
            "DEPENDENCY_UNAVAILABLE",
            "Synthetic lost upload",
            null,
            true,
          );
        return uploaded;
      },
    };
    assert.equal(await executeGoalSave(retained, dependencies), null);
    assert.equal(retained.savedGoal, goal);
    assert.equal(retained.draft.image, photo);
    assert.match(retained.error, /goal is saved.*photo/i);
    assert.equal(
      goalEditorAvailability(retained, uploaded, false).blocked,
      true,
      "a changed version needs explicit review before retry",
    );
    assert.equal(
      goalEditorAvailability(retained, goal, false).blocked,
      false,
      "an unchanged refreshed version permits the exact photo retry",
    );
    assert.equal(await executeGoalSave({ ...retained }, dependencies), uploaded);
    assert.equal(fields, 1, "photo retry must never create or edit the goal again");
    assert.deepEqual(photoVersions, [goal.updatedAt, goal.updatedAt]);
  });

  it("does not dispatch invalid drafts and preserves the exact edit version until a new review", async () => {
    let retained = draft();
    retained.draft.name = "";
    let calls = 0;
    assert.equal(
      await executeGoalSave(retained, {
        keep: (next) => {
          retained = next;
        },
        async saveFields() {
          calls += 1;
          return goal;
        },
        async savePhoto() {
          assert.fail("No photo");
        },
      }),
      null,
    );
    assert.equal(calls, 0);
    assert.equal(retained.uncertain, false);
    const editing = newGoalSession(goal, "2026-10-19");
    editing.draft.saved = "7000000";
    assert.equal(prepareGoalRequest(editing).input.expectedUpdatedAt, goal.updatedAt);
    const latest = { ...goal, updatedAt: "2026-10-19T00:01:00Z" };
    assert.equal(goalEditorAvailability(editing, latest, false).blocked, true);
    assert.equal(goalEditorAvailability(editing, undefined, false).unavailable, true);
  });

  it("does not describe a deleted idempotent create result as a saved goal", async () => {
    let retained = draft();
    assert.equal(
      await executeGoalSave(retained, {
        keep: (next) => {
          retained = next;
        },
        async saveFields() {
          return { ...goal, deletedAt: "2026-10-19T00:01:00Z" };
        },
        async savePhoto() {
          assert.fail("No photo");
        },
      }),
      null,
    );
    assert.match(retained.error, /removed/);
    assert.equal(retained.uncertain, true);
    assert.ok(retained.request);
  });

  it("compares saved settings as exact amounts, including user-entered leading zeros", () => {
    const session = draft();
    session.draft.saved = "06000000";
    assert.equal(goalHasDraftSettings(goal, session.draft), true);
    session.draft.saved = "not money";
    assert.equal(goalHasDraftSettings(goal, session.draft), false);
  });
});

describe("goal photo HTTP recovery", () => {
  it("keeps a concurrent photo change as a conflict requiring refreshed version review", async () => {
    const image = new File([new Uint8Array([0xff, 0xd8, 0xff])], "goal.jpg", {
      type: "image/jpeg",
    });
    await assert.rejects(
      uploadGoalImage(goal, image, async () => Response.json({}, { status: 409 })),
      (error) =>
        error instanceof FinanceClientError &&
        error.code === "CONFLICT" &&
        error.actionMayHaveCompleted === false,
    );
  });
  it("marks server errors and unverifiable successful replies as uncertain without exposing response details", async () => {
    const image = new File([new Uint8Array([0xff, 0xd8, 0xff])], "goal.jpg", {
      type: "image/jpeg",
    });
    for (const response of [
      Response.json({ private: "hidden" }, { status: 500 }),
      Response.json({ bad: "answer" }),
    ]) {
      await assert.rejects(
        uploadGoalImage(goal, image, async (_url, init) => {
          assert.equal(init.cache, "no-store");
          assert.equal(init.body.get("expectedUpdatedAt"), goal.updatedAt);
          return response;
        }),
        (error) =>
          error instanceof FinanceClientError &&
          error.actionMayHaveCompleted &&
          !error.message.includes("hidden"),
      );
    }
  });
});
