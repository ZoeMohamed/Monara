import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignoreIssues: {
    // Supabase generates reusable public helpers that may not have consumers yet.
    "packages/db/src/types/database.types.ts": ["exports", "types"],
  },
  workspaces: {
    ".": {
      // The security e2e suite: Playwright specs, the local Composio stand-in and the terminal recorder.
      entry: ["scripts/*.mjs", "e2e/*.spec.ts", "e2e/support/*.mjs"],
      project: ["scripts/*.mjs", "*.{ts,mjs}", "e2e/**/*.{ts,mjs}"],
      ignoreDependencies: [
        // Present since the initial prototype commit and not imported anywhere yet.
        "playwright-core",
      ],
    },
    "apps/agent": {
      // Feature owners wire these module entry points into the worker as they implement them.
      entry: ["src/*/index.ts"],
      // `cloudflare:workers` is a module the Workers runtime provides, not a package.
      ignoreDependencies: ["cloudflare"],
    },
    // Scaffolded packages declare the documented dependency direction before any code imports it.
    "packages/*": {},
    "playground/llm": {},
  },
  // Scaffold packages declare workspace dependencies that no code imports yet.
  ignoreDependencies: [/^@monara\//],
  // `pnpm dev:tunnel` uses a locally installed ngrok agent, and the terminal evidence
  // uses a locally installed VHS recorder; neither is a package.
  ignoreBinaries: ["ngrok", "vhs"],
};

export default config;
