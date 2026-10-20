# Shared reviewer account

Reviewers can sign in without Google and without connecting a mailbox. `demo@monara.app` is a real Monara account, so every screen, the chat agent, budgets, goals and the forecast run against records in the database, exactly as for any User. The public `/demo` route is separate: sample data held in the browser only.

## How it signs in

The sign-in screen has a "Sign in with email" option. It posts to `/auth/password`, which calls Supabase `signInWithPassword` and then checks the identity.

- Product access still requires a verified identity. `identityFromVerifiedClaims` accepts a password session only when `app_metadata.monara_demo_account` is the boolean `true`. Only an administrator holding the service-role key can write `app_metadata`, so a visitor cannot flag themselves.
- Any other account that signs in through the password form is signed straight back out. Every rejection shows the same message, so the form does not reveal which emails exist.
- The flagged account skips first-run Gmail setup, because it arrives with its records. It can still connect Gmail from Profile.
- The Profile delete control is hidden, and `/api/profile/deletion` answers 403 for it. A reviewer cannot remove the account for everyone else.

## What it contains

[`scripts/seed-demo-account.mjs`](../scripts/seed-demo-account.mjs) creates or refreshes the account and replaces only its own records:

- A copy of one real account's transactions (the source User ID is a script input), with private individuals scrubbed. Names in Person transactions become stand-ins, their free text and location are dropped, payments to them above Rp 750,000 are brought down to everyday sizes, and Gmail message IDs, extraction evidence and confidence scores are not copied. Copied rows with no date or no amount are skipped.
- About three months of realistic synthetic history before the copied stretch, plus payday, own-account moves and fixed bills inside it. The rules and generator are in [`scripts/lib/demo-seed.mjs`](../scripts/lib/demo-seed.mjs) and are deterministic.
- Monthly budgets, two goals and five recurring bills.

Dates are shifted so the newest copied transaction lands on today, so the data stays current each time the script runs.

## Running it

Credentials come from the environment and are never printed. Use a service-role key only on a machine you trust.

```sh
SEED_SUPABASE_URL=<project url> \
SEED_SERVICE_ROLE_KEY=<service-role key> \
SEED_SOURCE_USER_ID=<user id to copy from, optional> \
SEED_DEMO_PASSWORD=<password, needed to create the account or with --reset-password> \
node scripts/seed-demo-account.mjs [--dry-run] [--reset-password]
```

- `--dry-run` reads the source and prints the plan without writing.
- Without `SEED_SOURCE_USER_ID` the history is synthetic only.
- The script refuses to wipe an account that is not `demo@monara.app` with the reviewer flag.
- Run it again before a review window to roll the dates forward. It restores the seeded records, so reviewers' edits are discarded.

Local check: start the database with `pnpm db:start --runtime docker`, then run the script with the local URL and service-role key from `apps/web/.env.local`.
