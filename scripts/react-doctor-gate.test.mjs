import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = new URL("./react-doctor-gate.mjs", import.meta.url).href;
const successfulFindings = { status: 0, stdout: "", stderr: "" };

// Exercise the real gate in a child process without running pnpm or contacting the score API.
function runGate(results, ci = true) {
  const program = `
    import childProcess from "node:child_process";
    import { syncBuiltinESMExports } from "node:module";
    const results = ${JSON.stringify(results)};
    childProcess.spawnSync = (command, args) => {
      process.stdout.write("checked:" + args[2] + ":" + args.at(-1) + "\\n");
      const result = results.shift();
      if (!result) throw new Error("Unexpected subprocess call");
      if (result.error) result.error = new Error(result.error);
      return result;
    };
    syncBuiltinESMExports();
    await import(${JSON.stringify(script)});
  `;
  return spawnSync(process.execPath, ["--input-type=module", "--eval", program], {
    encoding: "utf8",
    env: { ...process.env, CI: ci ? "true" : "false" },
    timeout: 10_000,
  });
}

test("findings subprocess spawn failure reports its cause and fails closed", () => {
  const result = runGate([
    { status: null, stdout: null, stderr: null, error: "spawn pnpm ENOENT" },
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /spawn pnpm ENOENT/);
  assert.match(result.stderr, /failed or reported findings in apps\/web/);
  assert.doesNotMatch(result.stderr, /TypeError|\bnull\b/);
});

test("score subprocess spawn failure fails locally and in CI with a useful diagnostic", () => {
  for (const ci of [false, true]) {
    const result = runGate(
      [
        successfulFindings,
        { status: null, stdout: null, stderr: null, error: "spawn pnpm ENOENT" },
      ],
      ci,
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /spawn pnpm ENOENT/);
    assert.match(result.stderr, /could not run the score check for apps\/web/);
    assert.doesNotMatch(result.stderr, /TypeError/);
  }
});

test("missing score output fails CI without a parsing exception", () => {
  const result = runGate([successfulFindings, { status: 1, stdout: null, stderr: "" }]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /could not compute a score.*Rerun the job/);
  assert.doesNotMatch(result.stderr, /TypeError/);
});

test("local score outage still scans the second target and reports the skip explicitly", () => {
  const result = runGate(
    [
      successfulFindings,
      { status: 1, stdout: null, stderr: "" },
      successfulFindings,
      { status: 0, stdout: "100\n", stderr: "" },
    ],
    false,
  );
  assert.equal(result.status, 0);
  assert.match(result.stderr, /Skipping the score check locally; CI enforces it/);
  assert.match(result.stdout, /checked:packages\/ui:warning/);
  assert.match(result.stdout, /score 100.*packages\/ui/);
});

test("a score-shaped output cannot hide a failed score subprocess", () => {
  const result = runGate([
    successfulFindings,
    { status: 1, stdout: "100\n", stderr: "synthetic process failure" },
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /synthetic process failure/);
  assert.match(result.stderr, /failed the score check for apps\/web/);
  assert.doesNotMatch(result.stdout, /score 100 \(minimum/);
});
