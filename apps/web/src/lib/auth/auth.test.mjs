import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { browserOrigin, configuredTunnelOrigin, isSameOriginRequest } from "../http/origin.ts";
import { availablePublicSupabaseConfig } from "../supabase/config.ts";
import { isGoogleSignInAvailable } from "../supabase/provider.ts";
import { identityFromVerifiedClaims, profileFromIdentity } from "./identity.ts";
import { safeAuthenticatedNextPath, safeNextPath, signInErrorMessage } from "./redirect.ts";

describe("safe auth redirects", () => {
  it("keeps valid same-origin paths", () => {
    assert.equal(safeNextPath("/"), "/");
    assert.equal(
      safeNextPath("/connections/gmail?from=profile"),
      "/connections/gmail?from=profile",
    );
  });

  it("preserves safe post-auth destinations without sign-in loops", () => {
    assert.equal(
      safeAuthenticatedNextPath("/connections/gmail?from=profile#mailboxes"),
      "/connections/gmail?from=profile#mailboxes",
    );
    assert.equal(safeAuthenticatedNextPath("/sign-in?next=/"), "/");
    assert.equal(safeAuthenticatedNextPath("//attacker.example/path"), "/");
  });

  it("rejects absolute, protocol-relative, and missing destinations", () => {
    assert.equal(safeNextPath("https://attacker.example/path"), "/");
    assert.equal(safeNextPath("//attacker.example/path"), "/");
    assert.equal(safeNextPath("/.//attacker.example"), "/");
    assert.equal(safeNextPath("connections/gmail"), "/");
    assert.equal(safeNextPath(null), "/");
  });
});

describe("verified auth identity", () => {
  it("uses verified claims and Google profile metadata", () => {
    assert.deepEqual(
      identityFromVerifiedClaims({
        app_metadata: { provider: "google", providers: ["google"] },
        aud: "authenticated",
        sub: "78ed58f4-9fb2-4618-b715-bdf3bda2407a",
        email: "zoe@example.com",
        is_anonymous: false,
        role: "authenticated",
        user_metadata: { full_name: "Zoe Mohamed" },
      }),
      {
        displayName: "Zoe Mohamed",
        email: "zoe@example.com",
        id: "78ed58f4-9fb2-4618-b715-bdf3bda2407a",
        initials: "ZM",
      },
    );
  });

  it("fails closed without a verified subject", () => {
    assert.equal(identityFromVerifiedClaims({ email: "zoe@example.com" }), null);
    assert.equal(identityFromVerifiedClaims(null), null);
  });

  it("rejects anonymous, non-Google, and non-user JWT claims", () => {
    const baseClaims = {
      app_metadata: { provider: "google", providers: ["google"] },
      aud: "authenticated",
      is_anonymous: false,
      role: "authenticated",
      sub: "78ed58f4-9fb2-4618-b715-bdf3bda2407a",
    };

    assert.equal(identityFromVerifiedClaims({ ...baseClaims, is_anonymous: true }), null);
    assert.equal(
      identityFromVerifiedClaims({
        ...baseClaims,
        app_metadata: { provider: "email", providers: ["email"] },
      }),
      null,
    );
    assert.equal(identityFromVerifiedClaims({ ...baseClaims, role: "service_role" }), null);
    assert.equal(identityFromVerifiedClaims({ ...baseClaims, aud: "anon" }), null);
  });

  it("does not send the ownership key to Client Components", () => {
    assert.deepEqual(
      profileFromIdentity({
        displayName: "Zoe Mohamed",
        email: "zoe@example.com",
        id: "78ed58f4-9fb2-4618-b715-bdf3bda2407a",
        initials: "ZM",
      }),
      { displayName: "Zoe Mohamed", email: "zoe@example.com", initials: "ZM" },
    );
  });
});

describe("sign-in errors", () => {
  it("shows only known public messages", () => {
    assert.match(signInErrorMessage("oauth_start_failed"), /unavailable/);
    assert.equal(signInErrorMessage("raw-provider-error"), undefined);
  });
});

describe("Google provider availability", () => {
  const config = { url: "https://example.supabase.co", publishableKey: "public-key" };

  it("accepts only an explicitly enabled provider", async () => {
    assert.equal(
      await isGoogleSignInAvailable(config, async () =>
        Response.json({ external: { google: true } }),
      ),
      true,
    );
    assert.equal(
      await isGoogleSignInAvailable(config, async () =>
        Response.json({ external: { google: false } }),
      ),
      false,
    );
  });

  it("fails closed for unavailable or malformed settings", async () => {
    assert.equal(
      await isGoogleSignInAvailable(config, async () => new Response(null, { status: 503 })),
      false,
    );
    assert.equal(
      await isGoogleSignInAvailable(config, async () => Response.json({ external: null })),
      false,
    );
  });
});

describe("public Supabase configuration availability", () => {
  it("fails closed for missing or invalid public configuration", () => {
    for (const values of [
      { url: undefined, publishableKey: undefined },
      { url: "https://example.supabase.co", publishableKey: "  " },
      { url: "not-a-url", publishableKey: "public-key" },
      { url: "http://remote.example", publishableKey: "public-key" },
    ]) {
      assert.equal(availablePublicSupabaseConfig(values), null);
    }
  });

  it("retains validated public configuration for real session verification", () => {
    assert.deepEqual(
      availablePublicSupabaseConfig({
        url: " https://example.supabase.co/ ",
        publishableKey: " public-key ",
      }),
      { url: "https://example.supabase.co", publishableKey: "public-key" },
    );
    assert.deepEqual(
      availablePublicSupabaseConfig({
        url: "http://127.0.0.1:54321",
        publishableKey: "public-key",
      }),
      { url: "http://127.0.0.1:54321", publishableKey: "public-key" },
    );
  });
});

describe("browser OAuth origin", () => {
  it("uses the browser-facing Host instead of the development bind address", () => {
    const request = new Request("http://0.0.0.0:3005/auth/sign-in", {
      headers: { host: "localhost:3005" },
    });
    assert.equal(browserOrigin(request), "http://localhost:3005");
  });

  it("uses the public request origin and ignores spoofed forwarding headers", () => {
    const request = new Request("https://monara-finance.vercel.app/auth/sign-in", {
      headers: {
        host: "attacker.example",
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "http",
      },
    });
    assert.equal(browserOrigin(request), "https://monara-finance.vercel.app");
  });

  it("does not turn an invalid development Host into an OAuth callback", () => {
    const request = new Request("http://0.0.0.0:3005/auth/sign-in", {
      headers: { host: "attacker.example" },
    });
    assert.equal(browserOrigin(request), "http://0.0.0.0:3005");
  });

  it("trusts the developer's own NGROK_DOMAIN and no other ngrok host", () => {
    const tunnel = (host) => new Request("http://0.0.0.0:3005/", { headers: { host } });
    try {
      process.env.NGROK_DOMAIN = "https://EXAMPLE.ngrok-free.dev/";
      assert.equal(
        browserOrigin(tunnel("example.ngrok-free.dev")),
        "https://example.ngrok-free.dev",
      );
      assert.equal(browserOrigin(tunnel("other.ngrok-free.dev")), "http://0.0.0.0:3005");
    } finally {
      delete process.env.NGROK_DOMAIN;
    }
  });

  it("preserves the configured public tunnel for a loopback upstream without trusting forwarded hosts", () => {
    const previous = process.env.NGROK_DOMAIN;
    try {
      process.env.NGROK_DOMAIN = "example.ngrok-free.dev";
      const request = new Request("http://localhost:3005/auth/sign-in", {
        headers: { host: "example.ngrok-free.dev", "x-forwarded-host": "attacker.example" },
      });
      assert.equal(browserOrigin(request), "https://example.ngrok-free.dev");
      assert.equal(
        browserOrigin(
          new Request("http://localhost:3005/auth/sign-in", {
            headers: { host: "localhost:3005", "x-forwarded-host": "example.ngrok-free.dev" },
          }),
        ),
        "http://localhost:3005",
      );
    } finally {
      if (previous === undefined) delete process.env.NGROK_DOMAIN;
      else process.env.NGROK_DOMAIN = previous;
    }
  });

  it("validates tunnel configuration before using it as an OAuth destination", () => {
    assert.equal(
      configuredTunnelOrigin(" https://EXAMPLE.ngrok-free.dev/ "),
      "https://example.ngrok-free.dev",
    );
    assert.equal(
      configuredTunnelOrigin("example.ngrok-free.dev"),
      "https://example.ngrok-free.dev",
    );
    for (const invalid of [
      "",
      "localhost",
      "http://example.ngrok-free.dev",
      "127.0.0.1",
      "[::1]",
      "https://example.ngrok-free.dev:443",
      "https://user:secret@example.ngrok-free.dev",
      "https://example.ngrok-free.dev/path",
      "https://example.ngrok-free.dev?query",
      "https://example.ngrok-free.dev#fragment",
      "https://example.ngrok-free.dev//",
      "https://example.ngrok-free.dev/.",
      "internal.local",
      "finance.test",
    ])
      assert.equal(configuredTunnelOrigin(invalid), null, invalid);
  });
});

describe("same-origin mutation guard", () => {
  const url = "https://monara-finance.vercel.app/api/finance/operations/add_transaction";

  it("accepts requests the browser marks as same-origin", () => {
    assert.equal(
      isSameOriginRequest(new Request(url, { headers: { "sec-fetch-site": "same-origin" } })),
      true,
    );
  });

  it("refuses cross-site and same-site fetch metadata even with a matching Origin", () => {
    for (const site of ["cross-site", "same-site", "none"]) {
      const request = new Request(url, {
        headers: { "sec-fetch-site": site, origin: "https://monara-finance.vercel.app" },
      });
      assert.equal(isSameOriginRequest(request), false, site);
    }
  });

  it("falls back to an exact Origin match and refuses missing or opaque origins", () => {
    assert.equal(
      isSameOriginRequest(
        new Request(url, { headers: { origin: "https://monara-finance.vercel.app" } }),
      ),
      true,
    );
    assert.equal(
      isSameOriginRequest(new Request(url, { headers: { origin: "https://attacker.example" } })),
      false,
    );
    assert.equal(isSameOriginRequest(new Request(url, { headers: { origin: "null" } })), false);
    assert.equal(isSameOriginRequest(new Request(url)), false);
  });

  it("matches the browser origin in local development on 0.0.0.0", () => {
    const request = new Request("http://0.0.0.0:3005/api/chat", {
      headers: { host: "localhost:3005", origin: "http://localhost:3005" },
    });
    assert.equal(isSameOriginRequest(request), true);
  });
});
