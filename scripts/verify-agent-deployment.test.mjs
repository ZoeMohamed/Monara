import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyAgentDeployment } from "./verify-agent-deployment.mjs";

const config = {
  accountId: "test-account",
  token: "synthetic-test-token",
  workerUrl: "https://worker.example.test",
  message: "main test-revision",
};

function fixture(overrides = {}) {
  const calls = [];
  const responses = {
    "/deployments": { deployments: [{ versions: [{ version_id: "v1", percentage: 100 }] }] },
    "/versions/v1": { annotations: { "workers/message": config.message } },
    "/schedules": {
      schedules: ["* * * * *", "*/15 * * * *", "0 1 * * *", "0 17 * * *"].map((cron) => ({ cron })),
    },
    ...overrides,
  };
  return {
    calls,
    fetcher: async (input, options) => {
      const url = new URL(input);
      calls.push({ url, options });
      if (url.hostname === "api.cloudflare.com") {
        const path = url.pathname.split("/workers/scripts/monara-agent")[1];
        assert.equal(options.headers.Authorization, `Bearer ${config.token}`);
        assert.equal(options.method, undefined);
        return Response.json({ success: true, result: responses[path] });
      }
      assert.equal(url.origin, new URL(config.workerUrl).origin);
      assert.equal(options.headers, undefined);
      assert.equal(options.body, undefined);
      if (url.pathname === "/health") {
        return Response.json(overrides.health ?? { service: "monara-agent", status: "ok" });
      }
      assert.equal(url.pathname, "/users/purge");
      assert.equal(options.method, "POST");
      return new Response(null, { status: overrides.purgeStatus ?? 401 });
    },
  };
}

test("verifies the exact serving revision, all schedules, and deletion endpoint without User data", async () => {
  const { fetcher, calls } = fixture();
  assert.equal(await verifyAgentDeployment(config, fetcher), "v1");
  assert.equal(calls.length, 5);
  assert.ok(calls.every((call) => call.options.redirect === "error"));
});

test("a healthy old Worker cannot pass the revision check", async () => {
  const { fetcher, calls } = fixture({
    "/versions/v1": { annotations: { "workers/message": "main previous-revision" } },
  });
  await assert.rejects(verifyAgentDeployment(config, fetcher), /intended revision/);
  assert.equal(calls.length, 2);
});

test("a partial rollout cannot pass", async () => {
  const { fetcher } = fixture({
    "/deployments": {
      deployments: [{ versions: [{ version_id: "v1", percentage: 50 }] }],
    },
  });
  await assert.rejects(verifyAgentDeployment(config, fetcher), /100 percent/);
});

test("a missing deletion retry schedule fails even when health would succeed", async () => {
  const { fetcher } = fixture({
    "/schedules": { schedules: [{ cron: "*/15 * * * *" }, { cron: "0 1 * * *" }] },
  });
  await assert.rejects(verifyAgentDeployment(config, fetcher), /missing schedule/);
});

test("a missing or unconfigured purge endpoint fails", async () => {
  for (const purgeStatus of [404, 503, 204]) {
    const { fetcher } = fixture({ purgeStatus });
    await assert.rejects(verifyAgentDeployment(config, fetcher), /deletion endpoint/);
  }
});

test("unexpected health and denied metadata fail verification", async () => {
  const { fetcher } = fixture({ health: { service: "another-service", status: "ok" } });
  await assert.rejects(verifyAgentDeployment(config, fetcher), /health response/);
  await assert.rejects(
    verifyAgentDeployment(config, async () => new Response(null, { status: 403 })),
    /metadata request failed \(403\)/,
  );
});

test("missing configuration and non-HTTPS origins fail before any request", async () => {
  const fetcher = () => assert.fail("Unexpected request");
  await assert.rejects(verifyAgentDeployment({ ...config, token: "" }, fetcher), /incomplete/);
  await assert.rejects(
    verifyAgentDeployment({ ...config, workerUrl: "http://worker.example.test" }, fetcher),
    /HTTPS origin/,
  );
});
