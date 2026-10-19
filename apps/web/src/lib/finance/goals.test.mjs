import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectGoalImage, validGoalImageContentLength } from "../goals/image.ts";
import { buildGoalPlan } from "../goals/plan.ts";

const timestamp = "2026-10-18T00:00:00Z";
const goal = (overrides = {}) => ({
  id: "a1000000-0000-4000-8000-000000000001",
  name: "Laptop",
  target: { amountMinor: "12000000", currency: "IDR" },
  saved: { amountMinor: "6000000", currency: "IDR" },
  targetDate: "2027-04-18",
  status: "active",
  imagePath: null,
  deletedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  ...overrides,
});

const transaction = (kind, amount, date, overrides = {}) => ({
  id: crypto.randomUUID(),
  merchant: null,
  category: null,
  amount,
  currency: "IDR",
  date,
  time: null,
  method: null,
  kind,
  emoji: "•",
  confidence: null,
  status: "confirmed",
  ...overrides,
});

describe("goal projection", () => {
  it("uses only confirmed income and expense in the last 90 days", () => {
    const result = buildGoalPlan(
      [goal()],
      [
        transaction("income", 9_000_000, "2026-10-01"),
        transaction("expense", 3_000_000, "2026-10-02"),
        transaction("exclusion", 8_000_000, "2026-10-03"),
        transaction("income", 99_000_000, "2026-06-01"),
        transaction("expense", 2_000_000, "2026-10-04", { status: "pending" }),
      ],
      "2026-10-18",
    );
    assert.equal(result.monthlyIncome, 9_000_000n);
    assert.equal(result.monthlyExpense, 3_000_000n);
    assert.equal(result.monthlySurplus, 6_000_000n);
    assert.equal(result.savingsRatePercent, 66);
    assert.equal(result.active[0].requiredMonthly, 1_000_000n);
    assert.equal(result.active[0].projectedMonthlyContribution, 6_000_000n);
    assert.equal(result.active[0].projectedMonths, 1n);
    assert.equal(result.active[0].monthlyShortfall, 0n);
    assert.equal(result.monthlyGap, 0n);
    assert.equal(result.paceCoveragePercent, 600);
    assert.equal(result.state, "on-track");
  });

  it("reports no history without inventing a surplus", () => {
    const result = buildGoalPlan([goal()], [], "2026-10-18");
    assert.equal(result.monthlySurplus, 0n);
    assert.equal(result.savingsRatePercent, null);
    assert.equal(result.active[0].projectedMonths, null);
    assert.equal(result.state, "no-history");
  });

  it("shares recent surplus proportionally and exposes a deterministic shortfall", () => {
    const secondGoal = goal({
      id: "a1000000-0000-4000-8000-000000000002",
      name: "Holiday",
      target: { amountMinor: "6000000", currency: "IDR" },
      saved: { amountMinor: "0", currency: "IDR" },
    });
    const result = buildGoalPlan(
      [goal(), secondGoal],
      [
        transaction("income", 6_000_000, "2026-10-01"),
        transaction("expense", 3_000_000, "2026-10-02"),
      ],
      "2026-10-18",
    );

    assert.equal(result.totalRequiredMonthly, 2_000_000n);
    assert.equal(result.monthlySurplus, 3_000_000n);
    assert.deepEqual(
      result.active.map((item) => item.projectedMonthlyContribution),
      [1_500_000n, 1_500_000n],
    );
    assert.deepEqual(
      result.active.map((item) => item.projectedMonths),
      [4n, 4n],
    );
    assert.equal(result.monthlyGap, 0n);
    assert.equal(result.paceCoveragePercent, 150);
  });

  it("never treats negative cash flow, pending records, or exclusions as savings capacity", () => {
    const result = buildGoalPlan(
      [goal()],
      [
        transaction("income", 2_000_000, "2026-10-01"),
        transaction("expense", 4_000_000, "2026-10-02"),
        transaction("income", 99_000_000, "2026-10-03", { status: "pending" }),
        transaction("income", 99_000_000, "2026-10-04", { kind: "exclusion" }),
      ],
      "2026-10-18",
    );

    assert.equal(result.monthlyIncome, 2_000_000n);
    assert.equal(result.monthlyExpense, 4_000_000n);
    assert.equal(result.monthlySurplus, 0n);
    assert.equal(result.savingsRatePercent, -100);
    assert.equal(result.monthlyGap, 1_000_000n);
    assert.equal(result.paceCoveragePercent, 0);
    assert.equal(result.active[0].projectedMonths, null);
    assert.equal(result.active[0].monthlyShortfall, 1_000_000n);
    assert.equal(result.state, "needs-adjustment");
  });
});

describe("goal image detection", () => {
  it("accepts supported signatures and rejects unrelated bytes", () => {
    assert.equal(detectGoalImage(Uint8Array.from([0xff, 0xd8, 0xff]))?.extension, "jpg");
    assert.equal(
      detectGoalImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.extension,
      "png",
    );
    assert.equal(detectGoalImage(new TextEncoder().encode("not really an image")), null);
  });

  it("rejects missing, malformed, unsafe, and oversized request lengths before parsing", () => {
    assert.equal(validGoalImageContentLength(null), false);
    assert.equal(validGoalImageContentLength("not-a-number"), false);
    assert.equal(validGoalImageContentLength("-1"), false);
    assert.equal(validGoalImageContentLength("0"), false);
    assert.equal(validGoalImageContentLength(String(Number.MAX_SAFE_INTEGER + 1)), false);
    assert.equal(validGoalImageContentLength(String(3 * 1024 * 1024 + 100_001)), false);
    assert.equal(validGoalImageContentLength(String(3 * 1024 * 1024 + 100_000)), true);
  });
});
