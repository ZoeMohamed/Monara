import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { brands, institutionBrand, merchantBrand } from "../apps/web/src/data/brand-identity.ts";

test("known institutional names normalize spacing and case without inferring free-form banks", () => {
  assert.equal(institutionBrand("  Bank   Central Asia  "), "bca");
  assert.equal(institutionBrand("ＧｏＰａｙ"), "gopay");
  assert.equal(institutionBrand("BANK MANDIRI"), "mandiri");
  assert.equal(institutionBrand("Bank Jago"), "jago");
  for (const name of [null, undefined, "", "My BCA savings", "Bank", "constructor", "toString"])
    assert.equal(institutionBrand(name), undefined);
});

test("merchant aliases identify actual known payment titles without branding arbitrary notes", () => {
  assert.equal(merchantBrand("Grab · GrabCar"), "grab");
  assert.equal(merchantBrand("Spotify Premium"), "spotify");
  assert.equal(merchantBrand("Gojek · GoRide"), "gojek");
  assert.equal(merchantBrand("Lotte Mart"), "lotte-mart");
  assert.equal(merchantBrand("  Kopi  Kenangan "), "kopi-kenangan");
  assert.equal(merchantBrand("Telkomsel data plan"), "telkomsel");
  assert.equal(merchantBrand("PLN listrik"), "pln");
  for (const name of [
    null,
    "Food & Drinks",
    "NotNetflix",
    "Coffee before Netflix",
    "BCA",
    "A local convenience store",
    "constructor",
    "__proto__",
  ])
    assert.equal(merchantBrand(name), undefined);
});

test("every registered logo is a local file with recorded official provenance", () => {
  const directory = new URL("../apps/web/public/brands/", import.meta.url);
  const sources = readFileSync(new URL("README.md", directory), "utf8");
  const hashes = new Map(
    [...sources.matchAll(/^([a-f0-9]{64}) {2}([a-z.-]+)$/gm)].map(([, hash, asset]) => [
      asset,
      hash,
    ]),
  );
  for (const { asset } of Object.values(brands)) {
    assert.match(asset, /^[a-z-]+\.(svg|png|webp)$/);
    assert.ok(existsSync(new URL(asset, directory)), `${asset} is present`);
    assert.ok(sources.includes(asset), `${asset} has a provenance entry`);
    const bytes = readFileSync(new URL(asset, directory));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), hashes.get(asset), asset);
    if (asset.endsWith(".svg")) {
      const svg = readFileSync(new URL(asset, directory), "utf8");
      assert.doesNotMatch(svg, /<script|<foreignObject|\son\w+=|(?:href|src)=["']https?:/i);
    }
  }
});
