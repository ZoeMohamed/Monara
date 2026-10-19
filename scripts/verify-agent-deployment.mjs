import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";

/** Verify the deployed revision and deletion wiring without reading or changing User data. */
export async function verifyAgentDeployment(config, fetcher = fetch) {
  const { accountId, token, workerUrl, message } = config;
  if (!accountId || !token || !workerUrl || !message) {
    throw new Error("Worker verification configuration is incomplete.");
  }
  const origin = new URL(workerUrl);
  if (
    origin.protocol !== "https:" ||
    origin.pathname !== "/" ||
    origin.username ||
    origin.password
  ) {
    throw new Error("Worker verification requires an HTTPS origin.");
  }
  const api = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/scripts/monara-agent`;
  async function read(path) {
    const response = await fetcher(`${api}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    if (!response.ok) throw new Error(`Worker metadata request failed (${response.status}).`);
    const body = await response.json();
    if (!body.success) throw new Error("Worker metadata request was rejected.");
    return body.result;
  }

  const deployments = await read("/deployments");
  const active = deployments.deployments[0];
  if (active?.versions?.length !== 1 || active.versions[0].percentage !== 100) {
    throw new Error("Worker is not serving a single production version at 100 percent.");
  }
  const versionId = active.versions[0].version_id;
  const version = await read(`/versions/${encodeURIComponent(versionId)}`);
  if (version.annotations?.["workers/message"] !== message) {
    throw new Error("Production Worker does not match the intended revision.");
  }
  const { schedules } = await read("/schedules");
  for (const cron of ["* * * * *", "*/15 * * * *", "0 1 * * *", "0 2 * * 1"]) {
    if (!schedules.some((schedule) => schedule.cron === cron)) {
      throw new Error(`Production Worker is missing schedule: ${cron}`);
    }
  }
  const health = await fetcher(new URL("/health", origin), {
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  if (!health.ok) throw new Error(`Worker health check failed (${health.status}).`);
  const body = await health.json();
  if (body.service !== "monara-agent" || body.status !== "ok") {
    throw new Error("Worker health response is unexpected.");
  }
  // No credential or User ID is sent, so this cannot purge data.
  const purge = await fetcher(new URL("/users/purge", origin), {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  if (purge.status !== 401) {
    throw new Error(`Worker deletion endpoint check failed (${purge.status}).`);
  }
  return versionId;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    token: process.env.CLOUDFLARE_API_TOKEN,
    workerUrl: process.env.MONARA_AGENT_URL,
    message: process.env.MONARA_DEPLOYMENT_MESSAGE,
  };
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const version = await verifyAgentDeployment(config);
      console.log(
        `Verified production Worker ${version}: intended revision, schedules, and endpoints.`,
      );
      break;
    } catch (error) {
      // Provider bodies, headers, and credential values never enter deployment logs.
      console.error(`Worker verification attempt ${attempt} failed: ${error.message}`);
      if (attempt === 6) process.exitCode = 1;
      else await setTimeout(10_000);
    }
  }
}
