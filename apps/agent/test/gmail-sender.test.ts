import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSenderVerified } from "../src/gmail/sender.ts";

// Synthetic headers only.
const gmail = (results: string) => `mx.google.com; ${results}`;

describe("isSenderVerified", () => {
  it("accepts DKIM or SPF passing for the sender's domain or a parent of it", () => {
    assert.equal(isSenderVerified("bca@bca.co.id", [gmail("dkim=pass header.i=@bca.co.id")]), true);
    assert.equal(
      isSenderVerified("noreply@no-reply.superbank.id", [
        gmail("dkim=pass header.d=superbank.id header.s=s1"),
      ]),
      true,
    );
    assert.equal(
      isSenderVerified("klikbca@klikbca.com", [
        gmail("dkim=fail; spf=pass (google.com) smtp.mailfrom=bounce@mail.klikbca.com"),
      ]),
      true,
    );
  });

  it("rejects failed checks, other domains, and public suffixes", () => {
    assert.equal(
      isSenderVerified("bca@bca.co.id", [gmail("dkim=fail header.i=@bca.co.id")]),
      false,
    );
    assert.equal(
      isSenderVerified("bca@bca.co.id", [gmail("dkim=pass header.i=@evil.example")]),
      false,
    );
    assert.equal(isSenderVerified("bca@bca.co.id", [gmail("dkim=pass header.d=co.id")]), false);
    assert.equal(
      isSenderVerified("bca@bca.co.id", [gmail("spf=softfail smtp.mailfrom=bca.co.id")]),
      false,
    );
  });

  it("trusts only Gmail's own header at the top", () => {
    // A sender can add a header lower down, but not Gmail's, which comes first.
    assert.equal(
      isSenderVerified("bca@bca.co.id", [
        gmail("dkim=fail header.i=@bca.co.id"),
        gmail("dkim=pass header.i=@bca.co.id"),
      ]),
      false,
    );
    assert.equal(
      isSenderVerified("bca@bca.co.id", [
        "evil.example; dkim=pass header.i=@bca.co.id",
        gmail("dkim=pass header.i=@bca.co.id"),
      ]),
      false,
    );
    assert.equal(isSenderVerified("bca@bca.co.id", []), false);
    assert.equal(isSenderVerified(null, [gmail("dkim=pass header.i=@bca.co.id")]), false);
  });
});
