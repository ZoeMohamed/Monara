import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createForecastService, jakartaDate } from "./forecast-service.ts";

const userId = "90000000-0000-4000-8000-000000000001";
let counter = 0;
const expense = (occurredOn, merchantName, amount) => ({
  id: `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
  occurredOn,
  merchantName,
  categoryId: null,
  amount,
});

/** Four months of one bill: YouTube Premium on the 20th. */
function history() {
  return [6, 7, 8, 9].map((month) =>
    expense(`2026-${String(month).padStart(2, "0")}-20`, "YouTube Premium", 59_000),
  );
}

function fakeRepository(expenses) {
  const state = { stored: null, calls: [] };
  return {
    state,
    async listConfirmedExpenses(owner, from, to) {
      state.calls.push({ owner, from, to });
      return expenses.filter((item) => item.occurredOn >= from && item.occurredOn <= to);
    },
    async replaceForecast(owner, run, items) {
      state.calls.push({ owner, replaced: true });
      state.stored = {
        run: {
          id: "91000000-0000-4000-8000-000000000001",
          generatedAt: "2026-10-14T03:00:00.000Z",
          ...run,
        },
        items: items.map((item, index) => ({
          id: `92000000-0000-4000-8000-00000000000${index}`,
          ...item,
        })),
      };
    },
    async latestForecast() {
      return state.stored;
    },
  };
}

const at = (iso) => () => new Date(iso);

describe("jakartaDate", () => {
  it("uses the Jakarta calendar day", () => {
    assert.equal(jakartaDate(new Date("2026-10-14T20:00:00Z")), "2026-10-15");
    assert.equal(jakartaDate(new Date("2026-10-14T16:59:00Z")), "2026-10-14");
  });
});

describe("forecast service", () => {
  it("returns nothing before a forecast has been made", async () => {
    const service = createForecastService({
      repository: fakeRepository(history()),
      now: at("2026-10-14T03:00:00Z"),
    });
    assert.equal(await service.get(userId), null);
  });

  it("builds, stores and returns a forecast without a model", async () => {
    const repository = fakeRepository(history());
    const service = createForecastService({ repository, now: at("2026-10-14T03:00:00Z") });
    const summary = await service.refresh(userId, "manual");
    assert.equal(summary.items.length, 1);
    assert.equal(summary.items[0].merchantName, "YouTube Premium");
    assert.equal(summary.items[0].predictedOn, "2026-10-20");
    assert.equal(summary.items[0].amount.amountMinor, "59000");
    assert.equal(summary.items[0].realizedTransactionId, null);
    assert.equal(summary.usedModel, false);
    assert.equal(summary.threshold, 0.6);
    assert.equal(summary.totals.monthRemaining.amountMinor, "59000");
    assert.equal(summary.totals.projectedMonthEnd.amountMinor, "59000");
    assert.equal(summary.totals.weekRemaining.amountMinor, "0");
    assert.ok(repository.state.calls.every((call) => call.owner === userId));
  });

  it("uses the model's judgement and says so", async () => {
    const repository = fakeRepository(history());
    let sent = null;
    const service = createForecastService({
      repository,
      now: at("2026-10-14T03:00:00Z"),
      refine: async (candidates) => {
        sent = candidates;
        return [
          { key: "youtube premium", confidence: 0.95, reason: "Paid on the 20th every month." },
        ];
      },
    });
    const summary = await service.refresh(userId, "weekly");
    assert.equal(summary.usedModel, true);
    assert.equal(summary.source, "weekly");
    assert.equal(summary.items[0].reason, "Paid on the 20th every month.");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].merchantName, "YouTube Premium");
    assert.equal(JSON.stringify(sent).includes(userId), false);
  });

  it("falls back to the rules when the model fails", async () => {
    const service = createForecastService({
      repository: fakeRepository(history()),
      now: at("2026-10-14T03:00:00Z"),
      refine: async () => {
        throw new Error("model down");
      },
    });
    const summary = await service.refresh(userId, "manual");
    assert.equal(summary.usedModel, false);
    assert.equal(summary.items.length, 1);
  });

  it("drops a candidate the model marks down below the threshold and counts it", async () => {
    // The model can lower a perfect 1.0 only to 0.75, so a stricter threshold is needed to drop it.
    const service = createForecastService({
      repository: fakeRepository(history()),
      now: at("2026-10-14T03:00:00Z"),
      threshold: 0.8,
      refine: async () => [
        { key: "youtube premium", confidence: 0.1, reason: "Probably cancelled." },
      ],
    });
    const summary = await service.refresh(userId, "manual");
    assert.equal(summary.items.length, 0);
    assert.equal(summary.candidateCount, 1);
    assert.equal(summary.discardedCount, 1);
  });

  it("marks a prediction realized when the payment arrives, and keeps it out of the remaining total", async () => {
    const expenses = history();
    const repository = fakeRepository(expenses);
    const before = createForecastService({ repository, now: at("2026-10-14T03:00:00Z") });
    await before.refresh(userId, "manual");

    expenses.push(
      expense("2026-10-20", "YouTube Premium", 59_000),
      expense("2026-10-12", "Warung", 30_000),
    );
    const after = createForecastService({ repository, now: at("2026-10-20T10:00:00Z") });
    const summary = await after.get(userId);
    assert.ok(summary.items[0].realizedTransactionId);
    assert.equal(summary.totals.monthRemaining.amountMinor, "0");
    assert.equal(summary.totals.monthSpentSoFar.amountMinor, String(59_000 + 30_000));
    assert.equal(summary.totals.projectedMonthEnd.amountMinor, String(59_000 + 30_000));
  });

  it("keeps predictions out of confirmed spending", async () => {
    const repository = fakeRepository(history());
    const service = createForecastService({ repository, now: at("2026-10-14T03:00:00Z") });
    const summary = await service.refresh(userId, "manual");
    assert.equal(summary.totals.monthSpentSoFar.amountMinor, "0");
  });

  it("returns the current forecast instead of making another inside the cooldown", async () => {
    const repository = fakeRepository(history());
    let refined = 0;
    const refine = async () => {
      refined += 1;
      return null;
    };
    const first = createForecastService({
      repository,
      refine,
      cooldownMs: 20_000,
      now: at("2026-10-14T03:00:00Z"),
    });
    await first.refresh(userId, "manual");
    const soon = createForecastService({
      repository,
      refine,
      cooldownMs: 20_000,
      now: at("2026-10-14T03:00:10Z"),
    });
    await soon.refresh(userId, "manual");
    assert.equal(refined, 1);
    const later = createForecastService({
      repository,
      refine,
      cooldownMs: 20_000,
      now: at("2026-10-14T03:00:30Z"),
    });
    await later.refresh(userId, "manual");
    assert.equal(refined, 2);
  });

  it("does not count a payment made before the forecast as fulfilling it", async () => {
    // Chicken rice on Mondays, Wednesdays and Fridays for eight weeks up to Tuesday 13 October.
    const expenses = [];
    for (let day = Date.UTC(2026, 7, 17); day < Date.UTC(2026, 9, 14); day += 86_400_000) {
      const current = new Date(day);
      if ([1, 3, 5].includes(current.getUTCDay())) {
        expenses.push(expense(current.toISOString().slice(0, 10), "Ayam Geprek", 25_000));
      }
    }
    assert.ok(expenses.some((item) => item.occurredOn === "2026-10-12"));
    const service = createForecastService({
      repository: fakeRepository(expenses),
      now: at("2026-10-14T03:00:00Z"),
    });
    const summary = await service.refresh(userId, "manual");
    const today = summary.items.find((item) => item.predictedOn === "2026-10-14");
    assert.ok(today, "a prediction for Wednesday the 14th");
    // Monday's payment is two days away and the same amount, but it came before the forecast.
    assert.equal(today.realizedTransactionId, null);
    assert.equal(summary.totals.weekRemaining.amountMinor, String(25_000 * 2));
  });
});
