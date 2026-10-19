import assert from "node:assert/strict";
import { it } from "node:test";
import { deleteUserInputSchema } from "@monara/contracts";
import { deletionReceipt, userIdFromDeletionReceipt } from "./deletion-receipt.ts";
import { clearLocalUserState } from "./local-user-state.ts";
import { setupKeyForUser } from "./setup-key.ts";

const user = "d1900000-0000-4000-8000-000000000001";
const secret = "synthetic-test-only";

it("requires the exact phrase and explicit acknowledgement and rejects a supplied User ID", () => {
  const valid = { confirmation: "DELETE MY ACCOUNT", acknowledged: true };
  assert.equal(deleteUserInputSchema.safeParse(valid).success, true);
  for (const invalid of [
    { ...valid, confirmation: "DELETE" },
    { ...valid, confirmation: "delete my account" },
    { ...valid, confirmation: "DELETE MY ACCOUNT " },
    { ...valid, acknowledged: false },
    { ...valid, userId: user },
  ]) {
    assert.equal(deleteUserInputSchema.safeParse(invalid).success, false);
  }
});

it("a status receipt cannot be forged, swapped between Users, or read with another signing key", () => {
  const receipt = deletionReceipt(user, secret);
  assert.equal(userIdFromDeletionReceipt(receipt, secret), user);
  assert.equal(userIdFromDeletionReceipt(receipt.replace(/001\./, "002."), secret), null);
  assert.equal(userIdFromDeletionReceipt(receipt, "other-key"), null);
  assert.equal(userIdFromDeletionReceipt(`${receipt}.extra`, secret), null);
  assert.equal(userIdFromDeletionReceipt(undefined, secret), null);
});

it("a replacement identity gets its own setup progress even with the same Google email", () => {
  assert.notEqual(setupKeyForUser(user), setupKeyForUser("d1900000-0000-4000-8000-000000000002"));
});

it("clears User preferences and old onboarding without clearing demo or unrelated storage", () => {
  const values = new Map([
    ["monara.hide-amounts", "1"],
    ["monara.brand-logos.v1", "{}"],
    ["monara.onboarding.v2.live.someone@example.com", "done"],
    ["monara.tour.v1.live", "done"],
    ["monara.active-user", "key"],
    ["monara.onboarding.v2.demo", "done"],
    ["other-app", "keep"],
  ]);
  clearLocalUserState({
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
  });
  assert.deepEqual([...values.keys()], ["monara.onboarding.v2.demo", "other-app"]);
});
