import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { healthResponse, notFoundResponse } from "../src/http.ts";

describe("Agent HTTP boundary", () => {
  it("reports a live service without claiming it is still a scaffold", async () => {
    const response = healthResponse();

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { service: "monara-agent", status: "ok" });
  });

  it("returns not found for an unknown route", async () => {
    const response = notFoundResponse();

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Not found." });
  });
});
