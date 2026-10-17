import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { legalHref, legalReturnPath } from "./return.ts";

describe("legal page return target", () => {
  it("goes back to Profile and its demo twin", () => {
    assert.equal(legalReturnPath("/profile"), "/profile");
    assert.equal(legalReturnPath("/demo/profile"), "/demo/profile");
  });

  it("falls back to Home on a direct visit or an unknown value", () => {
    assert.equal(legalReturnPath(undefined), "/");
    assert.equal(legalReturnPath("/budgets"), "/");
    assert.equal(legalReturnPath(["/profile", "/demo/profile"]), "/");
  });

  it("never follows an external or protocol-relative address", () => {
    assert.equal(legalReturnPath("https://example.com"), "/");
    assert.equal(legalReturnPath("//example.com/profile"), "/");
  });

  it("builds a link the page reads back", () => {
    assert.equal(legalHref("terms", "/demo/profile"), "/terms?from=%2Fdemo%2Fprofile");
    assert.equal(legalReturnPath(decodeURIComponent("%2Fdemo%2Fprofile")), "/demo/profile");
  });
});
