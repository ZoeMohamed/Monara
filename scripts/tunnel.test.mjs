import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function run(domain) {
  return spawnSync(process.execPath, ["scripts/tunnel.mjs"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: {
      ...process.env,
      NGROK_DOMAIN: domain,
      NGROK_AUTHTOKEN: "synthetic-secret-not-for-output",
    },
  });
}

test("tunnel fails clearly without a configured public domain and does not expose its token", () => {
  const result = run("");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Set NGROK_DOMAIN/);
  assert.doesNotMatch(result.stdout + result.stderr, /synthetic-secret-not-for-output/);
});

test("tunnel validates URLs before spawning an external agent", () => {
  for (const domain of [
    "localhost",
    "http://example.ngrok-free.dev",
    "https://example.ngrok-free.dev/path",
    "https://user:secret@example.ngrok-free.dev",
  ]) {
    const result = run(domain);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must be a public HTTPS hostname/);
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /synthetic-secret-not-for-output|user:secret/,
    );
  }
});
