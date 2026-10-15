import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createComposioGmailReader, decodeBase64Url, GmailReadError } from "./gmail-read.ts";

const apiUrl = "https://composio.example/api/v3.1/";
const mailbox = { userId: "00000000-0000-4000-8000-000000000001", connectedAccountId: "ca_test" };

function encode(text) {
  return Buffer.from(text, "utf8").toString("base64url");
}

function fakeFetcher(responses) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body) : null, headers: init.headers });
    const next = responses.shift();
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  };
  return { fetcher, calls };
}

describe("configuration", () => {
  it("requires https except for localhost", () => {
    assert.throws(
      () => createComposioGmailReader({ apiUrl: "", apiKey: "key" }),
      /COMPOSIO_API_URL/,
    );
    assert.throws(
      () => createComposioGmailReader({ apiUrl: "http://composio.example", apiKey: "key" }),
      /https/,
    );
    assert.ok(createComposioGmailReader({ apiUrl: "http://localhost:9999", apiKey: "key" }));
  });
});

describe("decodeBase64Url", () => {
  it("decodes unpadded UTF-8 base64url", () => {
    assert.equal(
      decodeBase64Url(encode("Total Rp 25.000 — terima kasih")),
      "Total Rp 25.000 — terima kasih",
    );
  });
});

describe("listMessages", () => {
  it("sends the mailbox identity and reads ids, timestamps and the next page", async () => {
    const { fetcher, calls } = fakeFetcher([
      {
        body: {
          successful: true,
          data: {
            data: {
              messages: [
                { messageId: "m1", internalDate: "1760000000000" },
                { id: "m2" },
                { nothing: true },
              ],
              nextPageToken: "next",
            },
          },
        },
      },
    ]);
    const reader = createComposioGmailReader({ apiUrl, apiKey: "key", fetcher });
    const page = await reader.listMessages(mailbox, { query: "newer_than:30d", maxResults: 500 });

    assert.deepEqual(page, {
      messages: [
        { id: "m1", receivedAt: new Date(1760000000000).toISOString() },
        { id: "m2", receivedAt: null },
      ],
      nextPageToken: "next",
    });
    assert.equal(
      calls[0].url,
      "https://composio.example/api/v3.1/tools/execute/GMAIL_FETCH_EMAILS",
    );
    assert.equal(calls[0].headers["x-api-key"], "key");
    assert.equal(calls[0].body.user_id, mailbox.userId);
    assert.equal(calls[0].body.connected_account_id, "ca_test");
    assert.equal(calls[0].body.arguments.max_results, 100);
  });
});

describe("isConnectionUsable", () => {
  it("is false only when Composio reports an unusable or documented missing account", async () => {
    const { fetcher, calls } = fakeFetcher([
      { body: { status: "ACTIVE" } },
      { body: { status: "EXPIRED" } },
      {
        status: 404,
        body: {
          error: {
            message: "Connected account not found",
            code: 404,
            slug: "NotFoundError",
            status: 404,
            request_id: "req_synthetic",
            suggested_fix: "Reconnect the account",
            errors: [],
          },
        },
      },
    ]);
    const reader = createComposioGmailReader({ apiUrl, apiKey: "key", fetcher });
    assert.equal(await reader.isConnectionUsable("ca_test"), true);
    assert.equal(await reader.isConnectionUsable("ca_test"), false);
    assert.equal(await reader.isConnectionUsable("ca_test"), false);
    assert.equal(calls[0].url, "https://composio.example/api/v3.1/connected_accounts/ca_test");
  });

  it("throws rather than answering when the check itself fails", async () => {
    const { fetcher } = fakeFetcher([
      { status: 401, body: { error: "bad key" } },
      { status: 404, body: { detail: "Not Found" } },
    ]);
    const reader = createComposioGmailReader({ apiUrl, apiKey: "key", fetcher });
    await assert.rejects(reader.isConnectionUsable("ca_test"), { status: 401 });
    await assert.rejects(reader.isConnectionUsable("ca_test"), { status: 404 });
  });
});

describe("getMessage", () => {
  it("walks nested MIME parts and reads headers", async () => {
    const { fetcher } = fakeFetcher([
      {
        body: {
          successful: true,
          data: {
            id: "m1",
            internalDate: "1760000000000",
            payload: {
              mimeType: "multipart/mixed",
              headers: [
                { name: "From", value: "Toko <noreply@toko.example>" },
                { name: "Subject", value: "Struk pembayaran" },
              ],
              parts: [
                {
                  mimeType: "multipart/alternative",
                  parts: [
                    { mimeType: "text/plain", body: { data: encode("Total Rp 25.000") } },
                    { mimeType: "text/html", body: { data: encode("<b>Total</b> Rp 25.000") } },
                  ],
                },
              ],
            },
          },
        },
      },
    ]);
    const reader = createComposioGmailReader({ apiUrl, apiKey: "key", fetcher });
    const message = await reader.getMessage(mailbox, "m1");

    assert.equal(message.from, "Toko <noreply@toko.example>");
    assert.equal(message.subject, "Struk pembayaran");
    assert.equal(message.text, "Total Rp 25.000");
    assert.equal(message.html, "<b>Total</b> Rp 25.000");
  });

  it("fails without echoing the response body", async () => {
    const { fetcher } = fakeFetcher([
      { body: { successful: false, error: "secret mailbox content" } },
    ]);
    const reader = createComposioGmailReader({ apiUrl, apiKey: "key", fetcher });
    await assert.rejects(reader.getMessage(mailbox, "m1"), (error) => {
      assert.ok(error instanceof GmailReadError);
      assert.doesNotMatch(error.message, /secret mailbox content/);
      return true;
    });
  });

  it("reports HTTP failures with their status", async () => {
    const { fetcher } = fakeFetcher([{ status: 401, body: { error: "token details" } }]);
    const reader = createComposioGmailReader({ apiUrl, apiKey: "key", fetcher });
    await assert.rejects(reader.getMessage(mailbox, "m1"), { name: "GmailReadError", status: 401 });
  });
});
