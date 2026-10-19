import assert from "node:assert/strict";
import { it } from "node:test";
import { cleanUserGoalImages } from "../goals/storage-cleanup.ts";

const userId = "d1900000-0000-4000-8000-000000000001";
const otherId = "d1900000-0000-4000-8000-000000000002";

function storageFixture(names) {
  const remaining = new Set(names);
  const calls = [];
  const faults = {
    listing: false,
    removal: false,
    responseLost: false,
    malformed: false,
    info: false,
    settlement: false,
  };
  const pending = new Map();
  const client = {
    async rpc(name, input) {
      if (name === "list_pending_goal_image_uploads")
        return {
          data: [...pending].map(([upload_id, object_path]) => ({ upload_id, object_path })),
          error: null,
        };
      assert.equal(name, "settle_goal_image_upload");
      assert.equal(input.p_user_id, userId);
      if (faults.settlement) return { data: null, error: { code: "XX000" } };
      pending.delete(input.p_upload_id);
      return { data: null, error: null };
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, "goal-images");
        return {
          async info(path) {
            calls.push({ operation: "info", path });
            if (faults.info) return { data: null, error: new Error("Synthetic info outage") };
            return { data: remaining.has(path) ? { name: path } : null, error: null };
          },
          async list(prefix, options, parameters) {
            calls.push({ operation: "list", prefix, options });
            assert.ok(parameters.signal instanceof AbortSignal);
            if (faults.listing) return { data: null, error: new Error("Synthetic outage") };
            if (faults.malformed)
              return { data: [{ id: "file", name: "../another-user" }], error: null };
            const rows = new Map();
            for (const path of remaining) {
              if (!path.startsWith(`${prefix}/`)) continue;
              const rest = path.slice(prefix.length + 1);
              const first = rest.split("/")[0];
              rows.set(first, { name: first, id: rest.includes("/") ? null : "file-id" });
            }
            return {
              data: [...rows.values()]
                .sort((left, right) => left.name.localeCompare(right.name))
                .slice(options.offset, options.offset + options.limit),
              error: null,
            };
          },
          async remove(paths) {
            calls.push({ operation: "remove", paths });
            if (faults.removal) return { data: null, error: new Error("Synthetic outage") };
            for (const path of paths) remaining.delete(path);
            if (faults.responseLost) {
              faults.responseLost = false;
              throw new Error("Synthetic response lost after commit");
            }
            return { data: [], error: null };
          },
        };
      },
    },
  };
  return { client, remaining, calls, faults, pending };
}

it("drains every page and goal folder while preserving another owner's images", async () => {
  const names = [
    ...Array.from(
      { length: 225 },
      (_, index) => `${userId}/goal-a/image-${String(index).padStart(3, "0")}.png`,
    ),
    ...Array.from(
      { length: 105 },
      (_, index) => `${userId}/goal-${String(index).padStart(3, "0")}/image.png`,
    ),
    `${otherId}/goal-a/image.png`,
  ];
  const h = storageFixture(names);
  let completed = false;
  for (let step = 0; step < 120 && !completed; step++) {
    completed = await cleanUserGoalImages(h.client, userId);
  }
  assert.equal(completed, true);
  assert.deepEqual([...h.remaining], [`${otherId}/goal-a/image.png`]);
  const removals = h.calls.filter((call) => call.operation === "remove");
  assert.ok(
    removals.length > 100,
    "the next prefix page is discovered after earlier folders disappear",
  );
  for (const call of removals) {
    assert.ok(call.paths.length <= 100);
    assert.ok(call.paths.every((path) => path.startsWith(`${userId}/`)));
  }
  assert.ok(
    h.calls.filter((call) => call.operation === "list").every((call) => call.options.offset === 0),
  );
});

it("never marks a non-empty inventory complete after deleting its first batch", async () => {
  const h = storageFixture([`${userId}/goal/image.png`]);
  assert.equal(await cleanUserGoalImages(h.client, userId), false);
  assert.equal(await cleanUserGoalImages(h.client, userId), true);
});

it("fails closed on inventory and deletion errors, then safely retries a lost commit response", async () => {
  const h = storageFixture([`${userId}/goal/image.png`]);
  h.faults.listing = true;
  await assert.rejects(() => cleanUserGoalImages(h.client, userId));
  assert.ok(!h.calls.some((call) => call.operation === "remove"));
  h.faults.listing = false;
  h.faults.removal = true;
  await assert.rejects(() => cleanUserGoalImages(h.client, userId));
  assert.equal(h.remaining.size, 1);
  h.faults.removal = false;
  h.faults.responseLost = true;
  await assert.rejects(() => cleanUserGoalImages(h.client, userId));
  assert.equal(h.remaining.size, 0);
  assert.equal(await cleanUserGoalImages(h.client, userId), true);
});

it("rejects an invalid owner and provider paths that could escape their prefix", async () => {
  const h = storageFixture([`${userId}/goal/image.png`]);
  await assert.rejects(() => cleanUserGoalImages(h.client, `${userId}/../other`));
  assert.deepEqual(h.calls, []);
  h.faults.malformed = true;
  await assert.rejects(() => cleanUserGoalImages(h.client, userId));
  assert.ok(!h.calls.some((call) => call.operation === "remove"));
});

it("retains an absent uncertain upload until its actual object appears, then settles and drains it", async () => {
  const h = storageFixture([`${userId}/goal/existing.png`]);
  const path = `${userId}/goal/late.png`;
  h.pending.set("upload-id", path);
  assert.equal(await cleanUserGoalImages(h.client, userId), false);
  assert.equal(h.pending.size, 1);
  assert.equal(h.remaining.size, 1, "an unresolved upload is never erased as completion evidence");
  h.remaining.add(path);
  assert.equal(await cleanUserGoalImages(h.client, userId), false);
  assert.equal(h.pending.size, 0);
  assert.equal(h.remaining.size, 0);
  assert.equal(await cleanUserGoalImages(h.client, userId), true);
});

it("reconciles bounded upload batches and keeps completion evidence until all requests settle", async () => {
  const paths = Array.from({ length: 20 }, (_, index) => `${userId}/goal/image-${index}.png`);
  const h = storageFixture(paths);
  paths.forEach((path, index) => {
    h.pending.set(`upload-${index}`, path);
  });
  assert.equal(await cleanUserGoalImages(h.client, userId), false);
  assert.equal(h.pending.size, 12);
  assert.equal(h.calls.filter((call) => call.operation === "info").length, 8);
  assert.ok(!h.calls.some((call) => call.operation === "remove"));
  assert.equal(await cleanUserGoalImages(h.client, userId), false);
  assert.equal(h.pending.size, 4);
  assert.equal(await cleanUserGoalImages(h.client, userId), false);
  assert.equal(h.pending.size, 0);
  assert.equal(await cleanUserGoalImages(h.client, userId), true);
});

it("does not discard positive completion evidence during lookup or settlement outages", async () => {
  const path = `${userId}/goal/known-object.png`;
  const h = storageFixture([path]);
  h.pending.set("upload", path);
  h.faults.info = true;
  assert.equal(await cleanUserGoalImages(h.client, userId), false);
  assert.equal(h.pending.size, 1);
  h.faults.info = false;
  h.faults.settlement = true;
  await assert.rejects(() => cleanUserGoalImages(h.client, userId));
  assert.equal(h.pending.size, 1);
  assert.equal(h.remaining.size, 1);
  assert.ok(!h.calls.some((call) => call.operation === "remove"));
  h.faults.settlement = false;
  assert.equal(await cleanUserGoalImages(h.client, userId), false);
  assert.equal(await cleanUserGoalImages(h.client, userId), true);
});
