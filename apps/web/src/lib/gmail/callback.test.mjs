import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gmailCallbackUrl, gmailPageTunnelRedirect } from "./callback.ts";

function withTunnel(run) {
  const previous = { mode: process.env.NODE_ENV, domain: process.env.NGROK_DOMAIN };
  process.env.NODE_ENV = "development";
  process.env.NGROK_DOMAIN = "example.ngrok-free.dev";
  try {
    run();
  } finally {
    for (const [key, value] of [
      ["NODE_ENV", previous.mode],
      ["NGROK_DOMAIN", previous.domain],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("Gmail tunnel callback identity boundary", () => {
  it("sends the local connection page to the configured public host before sign-in", () =>
    withTunnel(() => {
      assert.equal(
        gmailPageTunnelRedirect("localhost:3005"),
        "https://example.ngrok-free.dev/connections/gmail",
      );
      assert.equal(gmailPageTunnelRedirect("example.ngrok-free.dev"), null);
      assert.equal(
        gmailPageTunnelRedirect("attacker.example"),
        "https://example.ngrok-free.dev/connections/gmail",
      );
      process.env.NODE_ENV = "production";
      assert.equal(gmailPageTunnelRedirect("localhost:3005"), null);
    }));

  it("creates a public callback only on the same configured tunnel origin", () =>
    withTunnel(() => {
      const request = new Request("http://0.0.0.0:3005/api/gmail/connections", {
        headers: { host: "example.ngrok-free.dev" },
      });
      assert.equal(
        gmailCallbackUrl(request),
        "https://example.ngrok-free.dev/api/gmail/connections/callback",
      );
      assert.equal(
        gmailCallbackUrl(new Request("http://localhost:3005/api/gmail/connections")),
        null,
      );
      assert.equal(
        gmailCallbackUrl(new Request("https://other.ngrok-free.dev/api/gmail/connections")),
        null,
      );
    }));

  it("ignores spoofed forwarding headers and permits a public production request origin", () =>
    withTunnel(() => {
      assert.equal(
        gmailCallbackUrl(
          new Request("http://localhost:3005/api/gmail/connections", {
            headers: {
              host: "localhost:3005",
              "x-forwarded-host": "example.ngrok-free.dev",
              "x-forwarded-proto": "https",
            },
          }),
        ),
        null,
      );
      process.env.NODE_ENV = "production";
      assert.equal(
        gmailCallbackUrl(
          new Request("https://finance.acme.com/api/gmail/connections", {
            headers: { host: "attacker.example", "x-forwarded-host": "attacker.example" },
          }),
        ),
        "https://finance.acme.com/api/gmail/connections/callback",
      );
    }));
});
