import assert from "node:assert/strict";
import { it } from "node:test";
import { mergeImportFeed } from "./merge-import-feed.ts";

it("refreshes a classified row without duplicating it or changing its position", () => {
  const old = { id: "one", kind: "expense", needsReview: true };
  const unchanged = { id: "two", kind: "income", needsReview: true };
  const updated = { ...old, kind: "exclusion", needsReview: false };
  const added = { id: "three", kind: "expense", needsReview: true };
  assert.deepEqual(mergeImportFeed([old, unchanged], [added, updated]), [
    added,
    updated,
    unchanged,
  ]);
  assert.deepEqual(mergeImportFeed([updated, unchanged], [updated]), [updated, unchanged]);
});
