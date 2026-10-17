import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chatReceiptMaxBytes } from "@monara/contracts";
import { prepareChatReceipt } from "./receipts.ts";

const id = "00000000-0000-4000-8000-000000000001";
const pngHeader = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

describe("receipt attachment boundary", () => {
  it("defaults an image-only submission to importing a transaction without inventing ledger fields", async () => {
    const file = new File([pngHeader], "receipt.png", { type: "image/png" });
    const result = await prepareChatReceipt(file, id);
    assert.equal(result.file, file);
    assert.equal(result.intent, "import_transaction");
    assert.equal(result.text, "");
    assert.deepEqual(result.attachment, {
      id,
      name: "receipt.png",
      mimeType: "image/png",
      sizeBytes: pngHeader.length,
    });
    assert.equal(Object.hasOwn(result, "amount"), false);
    assert.equal(Object.hasOwn(result, "category"), false);
  });

  it("rejects unsupported types, oversized files and mismatched image signatures before upload", async () => {
    for (const file of [
      new File(["<svg/>"], "image.svg", { type: "image/svg+xml" }),
      new File([pngHeader], "fake.jpg", { type: "image/jpeg" }),
      new File([new Uint8Array(chatReceiptMaxBytes + 1)], "large.png", { type: "image/png" }),
      new File([], "empty.png", { type: "image/png" }),
    ]) {
      await assert.rejects(prepareChatReceipt(file, id), /Choose a JPG|doesn’t look like/);
    }
  });
});
