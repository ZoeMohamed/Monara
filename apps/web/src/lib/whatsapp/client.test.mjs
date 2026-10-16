import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loadWhatsAppLink, sendWhatsAppLink, WhatsAppLinkClientError } from "./client.ts";

const challenge = {
  code: "482913",
  expiresAt: "2026-10-16T12:10:00Z",
  phoneLastFour: "0001",
  sendTo: "+12025550100",
};

describe("WhatsApp linking client", () => {
  it("sends only the phone to the owned route with private request options", async () => {
    const result = await sendWhatsAppLink(
      "POST",
      { phone: "+62 812 0000 0001" },
      {
        fetcher: async (url, request) => {
          assert.equal(url, "/api/whatsapp/link");
          assert.equal(request.method, "POST");
          assert.equal(request.cache, "no-store");
          assert.equal(request.credentials, "same-origin");
          assert.equal(request.redirect, "error");
          assert.ok(request.signal instanceof AbortSignal);
          assert.deepEqual(JSON.parse(request.body), { phone: "+62 812 0000 0001" });
          return Response.json(challenge);
        },
      },
    );
    assert.deepEqual(result, challenge);
  });

  it("validates owned public status and rejects internal or malformed fields", async () => {
    for (const link of [
      { status: "none" },
      { status: "pending", phoneLastFour: "0001", expiresAt: challenge.expiresAt },
      { status: "verified", phoneLastFour: "0001", verifiedAt: "2026-10-16T12:01:00Z" },
    ]) {
      assert.deepEqual(await loadWhatsAppLink({ fetcher: async () => Response.json(link) }), link);
    }
    for (const link of [
      { status: "verified" },
      { status: "none", userId: crypto.randomUUID() },
      { status: "pending", phoneLastFour: "0001", expiresAt: "tomorrow" },
      { status: "revoked" },
    ]) {
      await assert.rejects(
        loadWhatsAppLink({ fetcher: async () => Response.json(link) }),
        (error) => error instanceof WhatsAppLinkClientError && !error.actionMayHaveCompleted,
      );
    }
  });

  it("rejects forbidden identity input before sending", async () => {
    let calls = 0;
    for (const input of [
      { phone: "" },
      { phone: "x".repeat(41) },
      { phone: "+6281200000001", userId: crypto.randomUUID() },
    ]) {
      await assert.rejects(
        sendWhatsAppLink("POST", input, {
          fetcher: async () => {
            calls += 1;
            return Response.json(challenge);
          },
        }),
        (error) => error instanceof WhatsAppLinkClientError && error.code === "VALIDATION_FAILED",
      );
    }
    assert.equal(calls, 0);
  });

  it("reports malformed start success as an uncertain mutation without leaking payloads", async () => {
    for (const payload of [
      { ...challenge, code: "bad" },
      { ...challenge, expiresAt: "later" },
      { ...challenge, phoneE164: "+6281200000001" },
      null,
    ]) {
      await assert.rejects(
        sendWhatsAppLink(
          "POST",
          { phone: "+6281200000001" },
          { fetcher: async () => Response.json(payload) },
        ),
        (error) => {
          assert.ok(error instanceof WhatsAppLinkClientError);
          assert.equal(error.actionMayHaveCompleted, true);
          assert.match(error.message, /Check status/);
          assert.ok(!error.message.includes("6281200000001"));
          return true;
        },
      );
    }
  });

  it("requires an explicit valid unlink acknowledgement", async () => {
    assert.equal(
      await sendWhatsAppLink("DELETE", undefined, {
        fetcher: async () => Response.json({ ok: true }),
      }),
      undefined,
    );
    for (const payload of [{ ok: false }, { ok: true, extra: "unexpected" }, {}, null]) {
      await assert.rejects(
        sendWhatsAppLink("DELETE", undefined, { fetcher: async () => Response.json(payload) }),
        (error) => error instanceof WhatsAppLinkClientError && error.actionMayHaveCompleted,
      );
    }
  });

  it("distinguishes rejected changes, lost mutations and expired sign-in", async () => {
    await assert.rejects(
      sendWhatsAppLink(
        "POST",
        { phone: "+6281200000001" },
        {
          fetcher: async () =>
            Response.json(
              { code: "CONFLICT", message: "That number is already linked.", requestId: null },
              { status: 409 },
            ),
        },
      ),
      (error) =>
        error instanceof WhatsAppLinkClientError &&
        !error.actionMayHaveCompleted &&
        error.code === "CONFLICT",
    );
    for (const method of ["POST", "DELETE"]) {
      await assert.rejects(
        sendWhatsAppLink(method, method === "POST" ? { phone: "+6281200000001" } : undefined, {
          fetcher: async () => {
            throw new TypeError("Connection lost");
          },
        }),
        (error) => error instanceof WhatsAppLinkClientError && error.actionMayHaveCompleted,
      );
    }
    await assert.rejects(
      loadWhatsAppLink({ fetcher: async () => new Response(null, { status: 401 }) }),
      (error) => error instanceof WhatsAppLinkClientError && error.code === "UNAUTHENTICATED",
    );
  });

  it("honors cancellation even when a fetch implementation returns late", async () => {
    const controller = new AbortController();
    await assert.rejects(
      loadWhatsAppLink({
        signal: controller.signal,
        fetcher: async () => {
          controller.abort();
          return Response.json({ status: "none" });
        },
      }),
      (error) => error instanceof DOMException && error.name === "AbortError",
    );
  });
});
