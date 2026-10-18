import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dueForecastUsers } from "./due.ts";

const day = 86_400_000;
const now = Date.parse("2026-10-19T02:00:00Z");
const staleBefore = now - 6 * day;
const made = (daysAgo) => new Date(now - daysAgo * day).toISOString();

describe("dueForecastUsers", () => {
  it("puts Users without a forecast first, then the oldest", () => {
    const due = dueForecastUsers(
      [
        { userId: "b", generatedAt: made(7) },
        { userId: "c", generatedAt: null },
        { userId: "a", generatedAt: made(30) },
      ],
      staleBefore,
      10,
    );
    assert.deepEqual(due, ["c", "a", "b"]);
  });

  it("skips a forecast that is still fresh", () => {
    assert.deepEqual(
      dueForecastUsers([{ userId: "a", generatedAt: made(2) }], staleBefore, 10),
      [],
    );
  });

  it("does not starve later Users: a refreshed User drops behind the ones still waiting", () => {
    const users = ["u1", "u2", "u3", "u4"];
    const forecasts = new Map(users.map((userId) => [userId, null]));
    const pick = () =>
      dueForecastUsers(
        users.map((userId) => ({ userId, generatedAt: forecasts.get(userId) })),
        staleBefore,
        2,
      );
    const firstWeek = pick();
    assert.deepEqual(firstWeek, ["u1", "u2"]);
    for (const userId of firstWeek) forecasts.set(userId, made(0));
    // The next run, a week later, sees the first two as stale again but the others come first.
    for (const userId of firstWeek) forecasts.set(userId, made(7));
    assert.deepEqual(pick(), ["u3", "u4"]);
  });

  it("is stable when two forecasts were made at the same moment", () => {
    const at = made(10);
    const due = dueForecastUsers(
      [
        { userId: "z", generatedAt: at },
        { userId: "a", generatedAt: at },
      ],
      staleBefore,
      10,
    );
    assert.deepEqual(due, ["a", "z"]);
  });
});
