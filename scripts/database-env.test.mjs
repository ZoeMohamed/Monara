import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { localDatabaseValues, verifyLocalDatabase } from "./lib/database-env.mjs";

const status = {
  API_URL: "http://127.0.0.1:54321",
  PUBLISHABLE_KEY: "test-public-key",
  SERVICE_ROLE_KEY: "test-server-key",
};

describe("local database environment", () => {
  it("reads JSON and dotenv status without exposing unrelated values", () => {
    const values = localDatabaseValues(JSON.stringify({ env: { ...status, OTHER: "ignored" } }));
    assert.deepEqual(
      values,
      localDatabaseValues(
        Object.entries(status)
          .map(([key, value]) => `${key}="${value}"`)
          .join("\n"),
      ),
    );
    assert.deepEqual(Object.keys(values), [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
  });

  it("fails closed for missing credentials or a remote database URL", () => {
    assert.throws(
      () => localDatabaseValues(JSON.stringify({ API_URL: status.API_URL })),
      /missing/,
    );
    for (const url of [
      "https://project.supabase.co",
      "http://127.0.0.1.evil.test",
      "http://user:pass@localhost:54321",
      "http://localhost:54321/path",
    ]) {
      assert.throws(
        () => localDatabaseValues(JSON.stringify({ ...status, API_URL: url })),
        /outside this machine/,
      );
    }
  });

  it("checks the migrated API with the server credential and refuses redirects", async () => {
    const values = localDatabaseValues(JSON.stringify(status));
    await verifyLocalDatabase(values, async (url, options) => {
      assert.equal(url, `${status.API_URL}/rest/v1/financial_accounts?select=id&limit=0`);
      assert.equal(options.headers.apikey, status.SERVICE_ROLE_KEY);
      assert.equal(options.redirect, "error");
      return new Response("[]");
    });
    await assert.rejects(
      verifyLocalDatabase(values, async () => new Response("", { status: 503 })),
      /HTTP 503/,
    );
    await assert.rejects(
      verifyLocalDatabase(values, async () => {
        throw new Error("unreachable");
      }),
      /unreachable/,
    );
  });
});
