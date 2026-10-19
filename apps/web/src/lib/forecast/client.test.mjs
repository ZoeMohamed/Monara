import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ForecastClientError, fetchForecast, refreshForecast } from "./client.ts";

const summary = {
  runId: "91000000-0000-4000-8000-000000000001",
  generatedAt: "2026-10-14T03:00:00.000Z",
  source: "manual",
  month: "2026-10",
  threshold: 0.6,
  usedModel: true,
  candidateCount: 1,
  discardedCount: 0,
  items: [
    {
      id: "92000000-0000-4000-8000-000000000001",
      predictedOn: "2026-10-20",
      merchantName: "YouTube Premium",
      categoryId: null,
      amount: { amountMinor: "59000", currency: "IDR" },
      amountLow: { amountMinor: "59000", currency: "IDR" },
      amountHigh: { amountMinor: "59000", currency: "IDR" },
      confidence: 0.93,
      pattern: "monthly",
      reason: "Paid around the 20th in each of the last 4 months.",
      realizedTransactionId: null,
    },
  ],
  totals: {
    weekRemaining: { amountMinor: "0", currency: "IDR" },
    monthRemaining: { amountMinor: "59000", currency: "IDR" },
    monthSpentSoFar: { amountMinor: "500000", currency: "IDR" },
    projectedMonthEnd: { amountMinor: "559000", currency: "IDR" },
  },
  accuracy: { due: 0, realized: 0, meanAbsoluteErrorPercent: null },
};

describe("forecast client", () => {
  it("reads the latest forecast and validates it", async () => {
    let seen;
    const forecast = await fetchForecast(async (url, init) => {
      seen = { url: String(url), method: init.method };
      return Response.json({ forecast: summary });
    });
    assert.deepEqual(seen, { url: "/api/forecast", method: "GET" });
    assert.equal(forecast.items[0].merchantName, "YouTube Premium");
  });

  it("returns null before the first forecast", async () => {
    assert.equal(await fetchForecast(async () => Response.json({ forecast: null })), null);
  });

  it("makes a new forecast with POST", async () => {
    let method;
    const forecast = await refreshForecast(async (_url, init) => {
      method = init.method;
      return Response.json({ forecast: summary });
    });
    assert.equal(method, "POST");
    assert.equal(forecast.month, "2026-10");
  });

  it("shows safe messages for failures and never the response body", async () => {
    await assert.rejects(
      fetchForecast(async () => new Response("secret internals", { status: 500 })),
      (error) => error instanceof ForecastClientError && !error.message.includes("secret"),
    );
    await assert.rejects(
      fetchForecast(async () => new Response("x", { status: 429 })),
      /Too many requests/,
    );
    await assert.rejects(
      fetchForecast(async () => Response.json({ forecast: { nope: true } })),
      /could not be verified/,
    );
    await assert.rejects(
      fetchForecast(async () => {
        throw new Error("network");
      }),
      /could not be reached/,
    );
  });

  it("does not accept an empty answer when a forecast was requested", async () => {
    await assert.rejects(
      refreshForecast(async () => Response.json({ forecast: null })),
      /could not be made/,
    );
  });
});
