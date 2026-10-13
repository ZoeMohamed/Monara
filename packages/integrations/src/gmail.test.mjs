import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ComposioRequestError, createComposioGmailClient } from "./gmail.ts";

/** Records requests and answers each with the next queued response. */
function fakeFetch(...responses) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({
      url,
      method: init.method,
      headers: init.headers,
      body: JSON.parse(init.body ?? "null"),
    });
    const { status = 200, body = null } = responses.shift() ?? {};
    return new Response(body === null ? null : JSON.stringify(body), { status });
  };
  return { calls, fetcher };
}

const client = (fetcher) =>
  createComposioGmailClient({
    apiUrl: "https://composio.test/api/v3.1/",
    apiKey: "test-key",
    authConfigId: "ac_gmail",
    fetcher,
  });

describe("Composio Gmail client", () => {
  it("fails closed without configuration", () => {
    assert.throws(
      () =>
        createComposioGmailClient({
          apiUrl: "https://composio.test/api/v3.1",
          apiKey: " ",
          authConfigId: "ac_gmail",
        }),
      /COMPOSIO_API_KEY/,
    );
    for (const apiUrl of ["", "composio.test/api", "http://composio.test/api"]) {
      assert.throws(
        () => createComposioGmailClient({ apiUrl, apiKey: "k", authConfigId: "ac_gmail" }),
        /COMPOSIO_API_URL/,
      );
    }
  });

  it("creates a connect link for the Monara User with the project key", async () => {
    const { calls, fetcher } = fakeFetch({
      status: 201,
      body: { redirect_url: "https://connect.composio.dev/link/abc", connected_account_id: "ca_1" },
    });
    const result = await client(fetcher).createConnectLink({
      userId: "user-1",
      callbackUrl: "https://monara.example/cb",
    });
    assert.deepEqual(result, { redirectUrl: "https://connect.composio.dev/link/abc" });
    assert.equal(calls[0].url, "https://composio.test/api/v3.1/connected_accounts/link");
    assert.equal(calls[0].headers["x-api-key"], "test-key");
    assert.deepEqual(calls[0].body, {
      auth_config_id: "ac_gmail",
      user_id: "user-1",
      callback_url: "https://monara.example/cb",
    });
  });

  it("reports identity mismatch and expired sessions without throwing", async () => {
    const { fetcher } = fakeFetch({ status: 400 }, { status: 404 });
    const gmail = client(fetcher);
    const input = { sessionUri: "s", userId: "user-1" };
    assert.deepEqual(await gmail.completeConnection(input), {
      ok: false,
      reason: "identity_mismatch",
    });
    assert.deepEqual(await gmail.completeConnection(input), { ok: false, reason: "expired" });
  });

  it("reads the mailbox address from a wrapped profile response", async () => {
    const { fetcher } = fakeFetch({
      body: { successful: true, error: null, data: { data: { emailAddress: "Budi@Gmail.com" } } },
    });
    const email = await client(fetcher).getGmailAddress({ userId: "u", connectedAccountId: "ca" });
    assert.equal(email, "budi@gmail.com");
  });

  it("never copies provider response bodies into errors", async () => {
    const { fetcher } = fakeFetch({
      status: 500,
      body: { error: { message: "secret mailbox detail" } },
    });
    await assert.rejects(
      client(fetcher).createConnectLink({ userId: "u", callbackUrl: "https://x.example" }),
      (error) =>
        error instanceof ComposioRequestError &&
        error.status === 500 &&
        !error.message.includes("secret"),
    );
  });

  it("revokes at Google before deleting the connection", async () => {
    const { calls, fetcher } = fakeFetch(
      { body: { revoked_tokens: ["access_token", "refresh_token"] } },
      { status: 200 },
    );
    await client(fetcher).deleteConnection("ca_1");
    assert.deepEqual(
      calls.map((call) => [call.method, call.url.replace("https://composio.test/api/v3.1", "")]),
      [
        ["POST", "/connected_accounts/ca_1/revoke"],
        ["DELETE", "/connected_accounts/ca_1"],
      ],
    );
  });

  it("treats a missing connection as done without deleting", async () => {
    const { calls, fetcher } = fakeFetch({ status: 404 });
    await client(fetcher).deleteConnection("ca_1");
    assert.equal(calls.length, 1);
  });

  it("still deletes when revoke is unsupported or the connection is not active", async () => {
    for (const status of [400, 409]) {
      const { calls, fetcher } = fakeFetch({ status }, { status: 404 });
      await client(fetcher).deleteConnection("ca_1");
      assert.deepEqual(
        calls.map((call) => call.method),
        ["POST", "DELETE"],
      );
    }
  });

  it("keeps the connection when revoke fails on the server", async () => {
    const { calls, fetcher } = fakeFetch({ status: 500 });
    await assert.rejects(
      client(fetcher).deleteConnection("ca_1"),
      (error) => error instanceof ComposioRequestError && error.status === 500,
    );
    assert.equal(calls.length, 1);
  });
});
