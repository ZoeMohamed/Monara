# Development harness

Six people share this repository, so every quality gate runs automatically at commit, push, and in CI instead of depending on review. Biome handles formatting and linting for the whole workspace, ESLint with `eslint-config-next` stays only in apps/web because Biome's Next.js domain covers roughly half of the Next.js plugin's rules, and Knip, Sherif, and `tsc` cover dead code, workspace dependency consistency, and types. Husky runs fast Biome fixes on commit and the full `pnpm check` on push. CI repeats those checks on GitHub-hosted runners, and branch protection stays a manual GitHub setting.

apps/web must keep a react-doctor score of at least 95. react-doctor has no minimum-score option, so `scripts/react-doctor-gate.mjs` compares the number it prints. The score comes from react-doctor's remote API, which receives diagnostics with source context removed and file paths redacted. Telemetry and the Socket.dev supply-chain check stay off. Locally an unreachable API warns and skips the score check, while CI fails closed.

We considered Oxlint with Oxfmt, which is faster but pre-1.0 for formatting. We also rejected Aiccountant's push wrapper that posts a local-signoff status, because it adds friction for six people and a GitHub status is not needed to merge. Turborepo is omitted until `pnpm -r` becomes slow.
