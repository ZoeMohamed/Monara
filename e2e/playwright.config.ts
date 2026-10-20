import { defineConfig } from "@playwright/test";

// The security evidence suite. `local` runs against this checkout's disposable stack
// (pnpm db:start, a production web build and pnpm dev:agent). `production` only sends
// read-only, unauthenticated requests to the hosted app.
export default defineConfig({
  testDir: ".",
  outputDir: "./.results",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: "./.report", open: "never" }]],
  use: {
    channel: "chrome",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    trace: "retain-on-failure",
    actionTimeout: 20_000,
  },
  projects: [
    { name: "local", testMatch: /security\.spec\.ts/ },
    { name: "production", testMatch: /production\.spec\.ts/ },
  ],
});
