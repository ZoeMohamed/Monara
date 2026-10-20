import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultFinancialTimeZone, financialCalendarDate } from "./calendar.ts";

describe("financial calendar dates", () => {
  it("uses the existing Jakarta default across midnight, month and year boundaries", () => {
    assert.equal(defaultFinancialTimeZone, "Asia/Jakarta");
    for (const [instant, date] of [
      ["2026-10-18T16:59:59Z", "2026-10-18"],
      ["2026-10-18T17:00:00Z", "2026-10-19"],
      ["2026-10-18T22:00:00Z", "2026-10-19"],
      ["2026-10-31T18:00:00Z", "2026-11-01"],
      ["2026-12-31T18:00:00Z", "2027-01-01"],
    ]) {
      assert.equal(financialCalendarDate(instant), date);
      assert.equal(financialCalendarDate(new Date(instant)), date);
    }
  });

  it("honors an explicitly supplied timezone and daylight-saving offsets", () => {
    assert.equal(financialCalendarDate("2026-11-01T02:00:00Z", "America/New_York"), "2026-10-31");
    assert.equal(financialCalendarDate("2026-07-01T04:00:00Z", "America/New_York"), "2026-07-01");
    assert.equal(financialCalendarDate("2026-10-18T22:00:00Z", "UTC"), "2026-10-18");
  });

  it("rejects invalid instants or timezone names instead of substituting another date", () => {
    assert.throws(() => financialCalendarDate("not-a-date"), RangeError);
    assert.throws(
      () => financialCalendarDate("2026-10-18T22:00:00Z", "not-a-timezone"),
      RangeError,
    );
  });
});
