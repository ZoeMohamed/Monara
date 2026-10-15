import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === "./demo-ledger" &&
      context.parentURL?.endsWith("/data/finance-analytics.ts")
    ) {
      return nextResolve("./demo-ledger.ts", context);
    }
    return nextResolve(specifier, context);
  },
});
const { amountDisplay } = await import("../apps/web/src/data/amount-display.ts");
hooks.deregister();

test("hiding amounts masks exact and compact values without exposing their size or sign", () => {
  const display = amountDisplay(true);
  for (const amount of [0n, 1n, -25000n, 9007199254740991n]) {
    assert.equal(display.formatRupiah(amount), "••••••");
    assert.equal(display.compactAmount(amount), "••••••");
    assert.equal(display.compactAmount(amount, false), "••••••");
  }
});

test("notification and chat text mask money while retaining dates, counts, words and punctuation", () => {
  const display = amountDisplay(true);
  assert.equal(
    display.maskAmountText("Rp 100 budget. Rp100 more. Rp100,000 of Rp200,000 until 31 Oct."),
    "•••••• budget. •••••• more. •••••• of •••••• until 31 Oct.",
  );
  assert.equal(
    display.maskAmountText("−Rp25,000; IDR -500. Rp −600. Rp397.4k; kopi 25rb; dinner 300k."),
    "−••••••; ••••••. ••••••. ••••••; kopi ••••••; dinner ••••••.",
  );
  assert.equal(
    display.maskAmountText("2 payments on 2026-10-11; sharp5"),
    "2 payments on 2026-10-11; sharp5",
  );
});

test("showing amounts preserves exact rupiah, compact units and original messages", () => {
  const display = amountDisplay(false);
  assert.equal(display.formatRupiah(9007199254740991n), "Rp\u00a09,007,199,254,740,991");
  assert.equal(display.compactAmount(397490n), "Rp397.4k");
  assert.equal(display.compactAmount(397490n, false), "Rp397k");
  assert.equal(display.maskAmountText("Rp100 more; kopi 25rb"), "Rp100 more; kopi 25rb");
});
