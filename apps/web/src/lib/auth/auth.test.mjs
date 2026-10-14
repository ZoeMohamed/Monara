import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { browserOrigin } from "../http/origin.ts";
import { isGoogleSignInAvailable } from "../supabase/provider.ts";
import { identityFromVerifiedClaims, profileFromIdentity } from "./identity.ts";
import { safeNextPath, signInErrorMessage } from "./redirect.ts";

describe("safe auth redirects", () => {
  it("keeps valid same-origin paths", () => {
    assert.equal(safeNextPath("/"), "/");
    assert.equal(
      safeNextPath("/connections/gmail?from=profile"),
      "/connections/gmail?from=profile",
    );
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
});
