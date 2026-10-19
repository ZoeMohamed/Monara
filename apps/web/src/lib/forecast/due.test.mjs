import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dueForecastUsers,
  forecastNeedsRefresh,
  settleAutomaticForecastAttempt,
  shouldAutomaticallyRefreshForecast,
} from "./due.ts";

const day = 86_400_000;
const now = Date.parse("2026-10-19T02:00:00Z");
const staleBefore = now - 6 * day;
const made = (daysAgo) => new Date(now - daysAgo * day).toISOString();
const month = "2026-10";

describe("dueForecastUsers", () => {
  it("puts Users without a forecast first, then the oldest", () => {
    const due = dueForecastUsers(
      [
        { userId: "b", generatedAt: made(7), month },
        { userId: "c", generatedAt: null, month: null },
        { userId: "a", generatedAt: made(30), month },
      ],
      staleBefore,
      10,
      month,
    );
    assert.deepEqual(due, ["c", "a", "b"]);
  });

  it("skips a forecast that is still fresh", () => {
    assert.deepEqual(
      dueForecastUsers([{ userId: "a", generatedAt: made(2), month }], staleBefore, 10, month),
      [],
    );
  });

  it("refreshes a forecast for a month that is over, even a new one", () => {
    const due = dueForecastUsers(
      [
        { userId: "old-month", generatedAt: made(3), month: "2026-09" },
        { userId: "this-month", generatedAt: made(3), month },
      ],
      staleBefore,
      10,
      month,
    );
    assert.deepEqual(due, ["old-month"]);
  });

  it("does not starve later Users: a refreshed User drops behind the ones still waiting", () => {
    const users = ["u1", "u2", "u3", "u4"];
    const forecasts = new Map(users.map((userId) => [userId, null]));
    const pick = () =>
      dueForecastUsers(
        users.map((userId) => ({ userId, generatedAt: forecasts.get(userId), month })),
        staleBefore,
        2,
        month,
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
        { userId: "z", generatedAt: at, month },
        { userId: "a", generatedAt: at, month },
      ],
      staleBefore,
      10,
      month,
    );
    assert.deepEqual(due, ["a", "z"]);
  });
});

describe("nightly catch-up", () => {
  it("refreshes missing forecasts and ones from before Jakarta midnight", () => {
    assert.equal(forecastNeedsRefresh(null, "2026-10-19"), true);
    assert.equal(
      forecastNeedsRefresh({ month, generatedAt: "2026-10-18T16:59:59.999Z" }, "2026-10-19"),
      true,
    );
    assert.equal(
      forecastNeedsRefresh({ month, generatedAt: "2026-10-18T17:00:00.000Z" }, "2026-10-19"),
      false,
    );
    assert.equal(
      forecastNeedsRefresh({ month: "2026-09", generatedAt: "2026-10-19T01:00:00Z" }, "2026-10-19"),
      true,
    );
  });

  it("allows a same-day retry after an automatic refresh fails", () => {
    let attemptedDate = null;
    assert.equal(shouldAutomaticallyRefreshForecast(null, "2026-10-19", attemptedDate), true);

    attemptedDate = "2026-10-19";
    assert.equal(shouldAutomaticallyRefreshForecast(null, "2026-10-19", attemptedDate), false);
    attemptedDate = settleAutomaticForecastAttempt(attemptedDate, "2026-10-19", false);

    assert.equal(attemptedDate, null);
    assert.equal(shouldAutomaticallyRefreshForecast(null, "2026-10-19", attemptedDate), true);
  });

  it("keeps a successful automatic refresh limited to one attempt per day", () => {
    const attemptedDate = settleAutomaticForecastAttempt(null, "2026-10-19", true);
    assert.equal(attemptedDate, "2026-10-19");
    assert.equal(shouldAutomaticallyRefreshForecast(null, "2026-10-19", attemptedDate), false);
  });
});
