import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { atomicWriteEnv } from "./lib/atomic-env.mjs";

it("atomically creates and replaces env files with private permissions", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "monara-env-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const target = join(directory, ".env.local");
  atomicWriteEnv(target, "TOKEN=first\n");
  atomicWriteEnv(target, "TOKEN=second\n");
  assert.equal(readFileSync(target, "utf8"), "TOKEN=second\n");
  if (process.platform !== "win32") assert.equal(statSync(target).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(directory), [".env.local"]);
});

for (const stage of ["write", "replace"]) {
  it(`preserves credentials and cleans up after a failed ${stage}`, (t) => {
    const directory = mkdtempSync(join(tmpdir(), "monara-env-test-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const target = join(directory, ".env.local");
    writeFileSync(target, "TOKEN=original\n");
    const failure = new Error("simulated disk failure");
    const operations =
      stage === "write"
        ? {
            write: (file, _content, options) => {
              writeFileSync(file, "partial", options);
              throw failure;
            },
          }
        : {
            replace: () => {
              throw failure;
            },
          };
    assert.throws(() => atomicWriteEnv(target, "TOKEN=replacement\n", operations), failure);
    assert.equal(readFileSync(target, "utf8"), "TOKEN=original\n");
    assert.deepEqual(readdirSync(directory), [".env.local"]);
  });
}
