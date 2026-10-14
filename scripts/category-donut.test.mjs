import assert from "node:assert/strict";
import test from "node:test";

import { categoryDonutGeometry } from "../apps/web/src/data/category-donut.ts";

test("empty and nonpositive spending produce no misleading painted segments", () => {
  assert.deepEqual(categoryDonutGeometry([]), []);
  const segments = categoryDonutGeometry([0n, -2n]);
  assert.deepEqual(
    segments.map(({ path, proportion }) => [path, proportion]),
    [
      ["", 0],
      ["", 0],
    ],
  );
});

test("a single category renders a complete ring rather than a zero-length SVG arc", () => {
  const [segment] = categoryDonutGeometry([42n]);
  assert.equal(segment.proportion, 1);
  assert.equal((segment.path.match(/A/g) ?? []).length, 4);
  assert.ok(segment.path.endsWith(" Z"));
  assert.ok(segment.path.startsWith("M110.00000,13.00000"));
});

test("sectors preserve proportions and meet at exact shared endpoints clockwise from noon", () => {
  const segments = categoryDonutGeometry([1n, 1n, 2n]);
  assert.deepEqual(
    segments.map(({ proportion }) => proportion),
    [0.25, 0.25, 0.5],
  );
  assert.ok(segments[0].path.includes("A97,97 0 0 1 207.00000,110.00000"));
  assert.ok(segments[1].path.startsWith("M207.00000,110.00000"));
  assert.ok(segments[2].path.endsWith("A71,71 0 0 0 110.00000,181.00000 Z"));
  assert.equal(
    segments.reduce((sum, segment) => sum + segment.proportion, 0),
    1,
  );
  const [dominant, tiny] = categoryDonutGeometry([10n ** 400n, 1n]);
  assert.equal((dominant.path.match(/A/g) ?? []).length, 4);
  assert.equal(tiny.path, "");
});

test("sectors over half of spending take the large arc and retain the ring's center hole", () => {
  const [segment] = categoryDonutGeometry([3n, 1n]);
  assert.ok(segment.path.includes("A97,97 0 1 1"));
  assert.ok(segment.path.includes("A71,71 0 1 0"));
  assert.equal(segment.proportion, 0.75);
});

test("selected offsets move outward along each sector midpoint by seven SVG pixels", () => {
  const segments = categoryDonutGeometry([1n, 1n, 1n, 1n]);
  assert.ok(segments[0].offsetX > 0 && segments[0].offsetY < 0);
  assert.ok(segments[1].offsetX > 0 && segments[1].offsetY > 0);
  assert.ok(segments[2].offsetX < 0 && segments[2].offsetY > 0);
  assert.ok(segments[3].offsetX < 0 && segments[3].offsetY < 0);
  for (const segment of segments) {
    assert.ok(Math.abs(Math.hypot(segment.offsetX, segment.offsetY) - 7) < 1e-10);
  }
});

test("huge bigint totals stay finite and tiny categories are never inflated for visual effect", () => {
  const segments = categoryDonutGeometry([3n * 10n ** 400n, 10n ** 400n, 1n]);
  assert.ok(Math.abs(segments[0].proportion - 0.75) < 1e-14);
  assert.ok(Math.abs(segments[1].proportion - 0.25) < 1e-14);
  assert.ok(segments[2].proportion <= 1e-14);
  for (const segment of segments) {
    assert.equal(/NaN|Infinity/.test(segment.path), false);
    assert.ok(Number.isFinite(segment.offsetX) && Number.isFinite(segment.offsetY));
  }
  assert.equal(
    segments.reduce((sum, segment) => sum + segment.proportion, 0),
    1,
  );
});
