import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignoreIssues: {
    // Supabase generates reusable public helpers that may not have consumers yet.
    "packages/db/src/types/database.types.ts": ["exports", "types"],
  },
  workspaces: {
    ".": {
      entry: ["scripts/*.mjs"],
      project: ["scripts/*.mjs", "*.{ts,mjs}"],
      ignoreDependencies: [
        // Present since the initial prototype commit and not imported anywhere yet.
        "playwright-core",
      ],
    },
    "apps/agent": {
      // Feature owners wire these module entry points into the worker as they implement them.
      entry: ["src/*/index.ts"],
    },
    // Scaffolded packages declare the documented dependency direction before any code imports it.
    "packages/*": {},
    "playground/llm": {},
  },
  // Scaffold packages declare workspace dependencies that no code imports yet.
  ignoreDependencies: [/^@monara\//],
};

export default config;
