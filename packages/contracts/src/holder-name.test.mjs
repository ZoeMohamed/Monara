import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isHolderName } from "./holder-name.ts";

describe("deterministic holder matching", () => {
  const cases = [
    ["SATRIA WIBOWO PRATAMA", "Satria Wibowo Pratama", true],
    ["Bpk. ＳＡＴＲＩＡ  Wibowo Pratama", "Satria Wibowo Pratama", true],
    ["Satria Wibowo", "Satria Wibowo Pratama", true],
    ["Satria Wibowo Pratama", "Satria Wibowo", true],
    ["Pratama Satria", "Satria Wibowo Pratama", true],
    ["Satria Wibowa Pratamo", "Satria Wibowo Pratama", true],
    ["Satrio Wibow", "Satria Wibowo Pratama", true],
    ["Sattria Wibwo", "Satria Wibowo Pratama", true],
    ["Maria Marie", "Maria Mara", true],
    ["Satrio Wibowa Pratamo", "Satria Wibowo Pratama", false],
    ["Satrio Wawawa", "Satria Wibowo Pratama", false],
    ["Satria W", "Satria Wibowo Pratama", false],
    ["Satria", "Satria Wibowo Pratama", false],
    ["Satria Satria", "Satria Wibowo Pratama", false],
    ["Satria Satrio", "Satria Wibowo Pratama", false],
    ["Satria Wibowo Santos", "Satria Wibowo Pratama", false],
    ["Budi Pratama", "Satria Wibowo Pratama", false],
    ["Satria Wibwo", "Satria Wibowo", true],
    ["Satria Wiobwo", "Satria Wibowo", false],
    ["Muhammad Al", "Muhammad Al Farisi", false],
    ["Li An", "Li An", true],
    ["Li An", "Li An Santos", false],
    ["Sukarno", "SUKARNO", true],
    ["Sukarno Putra", "Sukarno", false],
    ["1234 5678", "1234 5678 Pratama", false],
    ["", "", false],
    ["Bpk.", "Ibu", false],
  ];
  for (const [counterparty, holder, expected] of cases) {
    it(`${JSON.stringify(counterparty)} matches ${JSON.stringify(holder)}: ${expected}`, () => {
      assert.equal(isHolderName(counterparty, holder), expected);
      assert.equal(isHolderName(holder, counterparty), expected, "matching is symmetric");
    });
  }
});
