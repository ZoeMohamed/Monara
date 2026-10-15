import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import {
  brandLogoChoice,
  brandLogoFromChoice,
  brandLogoSource,
  brands,
  institutionBrand,
  merchantBrand,
  searchBrands,
} from "../apps/web/src/data/brand-identity.ts";
import { categoryIconChoice, chosenCategoryLogo } from "../apps/web/src/data/category-icons.ts";

const simpleIcons = createRequire(new URL("../apps/web/package.json", import.meta.url))(
  "simple-icons",
);

test("known institutional names normalize spacing and case without inferring free-form banks", () => {
  assert.equal(institutionBrand("  Bank   Central Asia  "), "bca");
  assert.equal(institutionBrand("ＧｏＰａｙ"), "gopay");
  assert.equal(institutionBrand("BANK MANDIRI"), "mandiri");
  assert.equal(institutionBrand("Bank Jago"), "jago");
  assert.equal(institutionBrand(" ＯＶＯ  Cash "), "ovo");
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
  for (const [name, brand] of [
    [" Spotify ", "spotify"],
    ["NETFLIX", "netflix"],
    ["Alfamart", "alfamart"],
    ["Grab·GrabCar", "grab"],
    ["Grab · GrabFood", "grab"],
    ["Gojek·GoCar", "gojek"],
    ["GoFood", "gojek"],
    ["BCA", "bca"],
    ["Bank Jago", "jago"],
    ["Go Pay", "gopay"],
    ["OVO", "ovo"],
  ])
    assert.equal(merchantBrand(name), brand);
  for (const name of [
    null,
    "Food & Drinks",
    "NotNetflix",
    "Coffee before Netflix",
    "Netflix refund from a friend",
    "My BCA savings",
    "OVO birthday gift",
    "GoFood notes",
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
  for (const { asset } of Object.values(brands).filter((brand) => "asset" in brand)) {
    assert.match(asset, /^[a-z-]+\.(svg|png|webp|ico|gif|jpg)$/);
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

test("catalog brands name a real Simple Icons slug and render from this app", () => {
  const slugs = new Set(Object.values(simpleIcons).map((icon) => icon.slug));
  for (const [id, brand] of Object.entries(brands)) {
    assert.ok("asset" in brand || "simple" in brand, `${id} has artwork`);
    if ("simple" in brand) assert.ok(slugs.has(brand.simple), `${id} → ${brand.simple}`);
    assert.match(brandLogoSource(id), /^\/(brands\/[a-z-]+\.[a-z]+|brand-icons\/[a-z0-9]+\.svg)$/);
  }
});

test("banks and wallets resolve by exact name while merchants never become institutions", () => {
  assert.equal(institutionBrand("BRI"), "bri");
  assert.equal(institutionBrand("Bank Negara Indonesia"), "bni");
  assert.equal(institutionBrand("DANA"), "dana");
  assert.equal(institutionBrand("ShopeePay"), "shopeepay");
  assert.equal(institutionBrand("Netflix"), undefined);
  assert.equal(merchantBrand("YouTube Premium"), "youtube");
  assert.equal(merchantBrand("Dana darurat"), undefined);
  assert.deepEqual(searchBrands("bank n", ["bank"]), ["bni"]);
  assert.ok(searchBrands("shop").includes("shopee"));
});

test("logo choices round-trip and reject anything that is not a known reference", () => {
  assert.equal(brandLogoFromChoice(brandLogoChoice("netflix")), "netflix");
  assert.equal(brandLogoFromChoice(brandLogoChoice("si:monzo")), "si:monzo");
  for (const value of [null, "", "food", "brand:unknown", "si:../x", "si:Monzo", "brand:__proto__"])
    assert.equal(brandLogoFromChoice(value), undefined);
  assert.equal(chosenCategoryLogo("Netflix"), "netflix");
  assert.equal(chosenCategoryLogo("Netflix", "auto"), "netflix");
  assert.equal(chosenCategoryLogo("Netflix", "film"), undefined);
  assert.equal(categoryIconChoice("Spotify", null), "brand:spotify");
  assert.equal(categoryIconChoice("Pets", "si:petco"), "si:petco");
  assert.equal(categoryIconChoice("Digital", null), "digital");
});
