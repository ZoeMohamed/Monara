# Gmail ingestion v2 implementation plan (2026-10-17)

> Historical implementation plan. Main `8778e3f` and the accepted [typed categorization design](gmail-categorization-design-2026-10-19.md) supersede its name matching, category policy and execution details. Preserve structured evidence, exact normalized confirmed-name matching for Internal, typed owned Category IDs, canonical public-brand-only search, classification confidence and terminal needs-review status. Every sync uses the rolling thirty-day window with existing durable message/source-index deduplication. The reduced v1 defers extraction leases, outboxes, broad replay and higher concurrency; the recovery integration removes its older unpublished lease machinery. The [source-date safety change](../supabase/migrations/20261020044252_source_transaction_dates.sql) keeps receipt/manual dates unknown while preserving Gmail’s source-email arrival-day fallback. Use the [current meeting handoff](ui-meeting-handoff-2026-10-17.md) for source and acceptance boundaries.

> Permanent-deletion activity checks remain required around provider/model retries. Parse jobs are bounded by current main and older larger jobs split safely; the historical ten-email plan below does not supersede that fence. Current combined verification is recorded in the [integration handoff](ui-backend-handoff.md#current-integration-verification).

Design: https://claude.ai/artifact/SECpfvDUu6n5oP5DYMzMUn (version 4). Branch `feat/email-ingestion-improvement-2`.

Goal: a Gmail import that finishes while the user is still on the onboarding screen. Every flow (onboarding, manual account add, Composio trigger, daily cron) runs through the same three stages on the agent worker: discover, ingest, parse.

## Ground rules

- Follow AGENTS.md. Strict TypeScript, no `any`. Validate external input. Never log email content, names, amounts, or tokens.
- Keep financial writes in the web backend. The worker calls backend operations only.
- Never invent amounts, dates, currencies, or account mappings. The existing guards in `apps/agent/src/gmail/extract.ts` stay.
- Each phase leaves `main`-compatible code: old job kinds and operations keep working for one deploy, so in-flight queue messages drain.
- Local only. No Composio dashboard changes, no remote migrations, no deploys, and no messages to real users.
- Commit each phase locally as one Conventional Commit (hooks run, fix what they report). Never push.
- The Workers plan is unknown: build for the Free plan's limits and make the parse batch size and consumer settings config values, so they can be raised on Paid.
- UI changes are in scope for this branch: the name-before-banks order, the email picker, the new-account badge, and removing Sync Now. Reuse existing components, use a mobile viewport (390 × 844), and keep react-doctor at 95 or above with no findings.

## Stop and ask the user before

- Changing anything in Composio (webhook URL, triggers on real accounts) or running a real Gmail or LLM test (see the memory note on live tests: the user presses the buttons, Claude watches).
- Any design choice the artifact leaves open (the open questions section).

## Phase 1: batched parse jobs and fewer round trips

The biggest speed and queue-quota win. No schema change for users, no UI change.

- Contracts (`packages/contracts/src/gmail-extraction.ts`):
  - Add the `gmail.parse` job: `connectionId` plus 1–10 `{ processedMessageId, gmailMessageId, receivedAt }`.
  - Change `merchant.categorize` to take 1–10 `transactionIds`.
  - Keep `gmail.extract` and the single-id merchant job parseable for one deploy.
  - Have `claim-messages` return `processedMessageId` for each pending email.
  - Add `record-extractions`: up to 10 results, the same per-item fields as `record-extraction`.
- Database: if the claim RPC doesn't return the ids yet, a migration that returns them, plus a batch record function (or a loop over the existing one inside one RPC). Each message is still finished exactly once under its row lock. pgTAP for both. Regenerate the types.
- Core (`packages/core/src/gmail-ingestion.ts` and the Supabase repo): wire `record-extractions` and the new claim result. Ownership stays inside the RPCs.
- Worker:
  - `syncConnection` claims, then queues `gmail.parse` jobs of up to 10 emails.
  - The new `processBatch` resolves the connection once and runs emails 5 at a time.
  - It records all finished emails in one call, then throws if any failed, so only those retry.
  - On the final attempt, it records the remaining emails as `failed`.
- `wrangler.jsonc` Gmail consumer: `max_batch_size` 2, `max_batch_timeout` 1, plus a `max_concurrency` value with a comment explaining it. Merchant jobs are batched.
- Done when:
  - Agent tests cover: batching into jobs of 10; one resolve and one record per job; a partial failure retries only the unrecorded emails; the final attempt records failures; old job kinds still run.
  - Core tests cover the new operations.
  - `pnpm --filter @monara/agent typecheck test`, core typecheck and test, `pnpm db:check`, and a Wrangler dry-run build all pass.

## Phase 2: discovery in the web app

Discovery reads metadata only, with no LLM, so it runs in the web app instead of going through the queue.

- Move the discovery logic from `apps/agent/src/gmail/pipeline.ts` (`discover`, `tally`, last-four parsing) into `packages/core`, using the Composio Gmail reader from `packages/integrations`. It reads metadata from all registry senders over 30 days (up to 500 messages), writes `gmail_institution_discoveries`, and sets the discovery state itself. Keep the existing repository functions and RPCs.
- OAuth callback: start discovery with Next.js `after()`, so the redirect isn't delayed. Read the local Next.js docs for `after()` first.
- `POST /api/gmail/connections/[id]/discovery` runs it inline (ownership checked). The GET reruns it inline when the state is `idle` or `failed`, or has been `running` longer than a stall timeout.
- New agent operation `POST /api/agent/gmail/discover {connectionId}` (backend secret) runs the same code. It's for the daily cron only.
- Worker: the `gmail.discover` job becomes a thin call to that operation. Delete the worker's discovery code and the `/gmail/discover` route. Delete the `start-discovery`, `record-discovery` and `report-discovery-failure` operations once nothing calls them; keep them for one deploy if the worker still might.
- Done when: core tests cover discovery (tally, last fours, a listing without senders, failure state); web tests cover callback, POST and GET retry, and the agent operation's auth; agent tests cover the thin job; web lint, typecheck and build pass, as do agent typecheck, test and the Wrangler dry-run.

## Phase 3: parse module and holder name

- Move the prompt, schema, guards, and formatting into `apps/agent/src/gmail/parse/`, exporting `shouldParse`, `parseEmail`, and `applyHolderRules`. Keep `extract.ts` behavior identical apart from the additions below.
- Prompt changes: use the system and user messages from the artifact's Prompt section. Add the `counterpartyName` field. The holder name goes in a tag, with delimiter escaping, angle brackets removed, and a 100-character cap. Categories stay out of the parse call.
- `applyHolderRules`:
  - Normalize both names: lowercase, strip punctuation and honorifics (Bpk, Ibu, Sdr, Mr, Mrs), collapse spaces.
  - It's a match on equality, when all holder words appear in the counterparty, or when the counterparty is a cut-off start of the holder name of at least 2 words.
  - A surname alone never matches. A match only changes expense or income to exclusion.
- `resolve-connection` returns `holderName`: `profiles.full_name`, else the Google name, else null. With a null name the rule doesn't run.
- `shouldParse`: add an optional `skipSubjects` pattern list per institution in `packages/contracts/src/institutions/institution-senders.json`, with schema validation. Matching mail is recorded as `skipped`. Start with a short list of patterns that are clearly safe; don't guess for banks you can't check.
- Done when:
  - Unit tests cover the holder rule (match, truncation, surname-only, honorifics, null name), the prefilter, and prompt formatting (escaping).
  - The existing extract tests still pass.
  - Agent and core typecheck and test pass, and `pnpm db:check` passes.

## Phase 4: category before auto-confirm

- Categories come from:
  1. The User's history for that merchant (`user_merchant_category`).
  2. Otherwise the merchant lookup, which is the default for every transaction without a history category. The lookup checks the shared `merchant_profiles` cache, runs a Brave search on a miss, then calls `chooseCategory` (kept at 0.6 confidence or higher with an exact match).
- No confident category means the transaction stays pending review with an empty category, even if it would otherwise auto-confirm.
- Migration:
  - `record_gmail_extraction` and the batch function store whether each transaction qualifies for auto-confirm: verified sender, confidence, amount, date, mapped account. A transaction without a category is saved as pending.
  - `set_imported_category` confirms a qualifying transaction in the same call that sets its category. It never changes a transaction the User has touched.
  - pgTAP covers: qualifying with a category confirms; qualifying without a category stays pending; a User edit blocks both.
- Worker: deduplicate merchants within a merchant batch, so each distinct merchant has one lookup per batch. Set the merchant queue's concurrency from Brave's rate limit.
- Done when: `pnpm db:check` passes, types are regenerated, and agent and core tests pass. The tests cover deferred auto-confirm and the review fallback.

## Phase 5: start the import when an account is linked

- Worker: rename `POST /gmail/sync` to `POST /gmail/ingest` with body `{ connectionId, reason, institutionKeys?, messageIds? }`. Keep `/gmail/sync` as an alias for one deploy. An ingest with `institutionKeys` lists only those banks' senders.
- Web: after `create_financial_account` succeeds for an account that has an email institution, a linked Gmail, and a profile with a name, call ingest for that bank. The same applies when `update_financial_account` changes the Gmail. The first `PUT /api/profile/full-name` ingests any linked mailbox that has never been imported.
- Onboarding order: connect → name → confirm banks → import in the live engine. The demo engine has no Gmail to connect, so it starts at name and runs on sample data.
- Done when: web tests cover each trigger condition and that no ingest runs without a name; web lint, typecheck, and build pass; react-doctor stays at 95 or above with no findings.

## Phase 6: one Gmail per financial account

- Migration:
  - `financial_accounts.gmail_connection_id uuid null` with a composite FK (id, user_id) to `gmail_connections`, plus RLS.
  - Backfill: link accounts that have an email institution when the User has exactly one mailbox. With several mailboxes, leave them unlinked; imports for those accounts pause until the User picks an email in Profile.
  - pgTAP: cross-user linking is rejected, the backfill is right, and disconnecting clears the link.
- `resolve-connection` and ingest use only the accounts linked to that mailbox.
- The finance operations accept `gmailConnectionId` and check ownership on the server.
- Disconnecting a Gmail clears the link on its accounts in the same operation.
- Connecting a second Gmail runs discovery in the web app (Phase 2), and its findings are offered for confirmation.
- Email picker on manual add and edit: required when at least one Gmail is connected; options are the Gmails plus "None". Profile asks unlinked accounts to pick.
- Done when: `pnpm db:check` passes, types are regenerated, core and web tests cover the ownership checks, and web lint, typecheck, and build pass.

## Phase 7: remove Sync Now

- Delete `GET|POST /api/gmail/connections/[id]/sync` and the client calls to it.
- Move import status (state and counts) and `newAccounts` into `GET /api/gmail/connections`.
- Drop `sync_requested_at` and `request_gmail_sync` once nothing uses them.
- Remove the button.
- Done when: knip finds no dead exports and web lint, typecheck, build, and react-doctor pass.

## Phase 8: Composio trigger and webhook (code only)

- Integrations: functions to create, update, and delete a `GMAIL_NEW_GMAIL_MESSAGE` trigger with the query `from:(…)` for the mailbox's linked senders. Store `composio_trigger_id` (migration). Read Composio's current docs for the trigger and webhook signature format before writing this.
- Web: `POST /api/webhooks/composio`.
  - Verify the signature, failing closed if the secret is missing.
  - Map the connected account to a connection with a server-side lookup.
  - Ignore inactive or unknown connections.
  - Call ingest with `messageIds`.
  - Never log the payload.
- Update the trigger when an account is linked or moved, and delete it on disconnect.
- Stop before pointing the dev project's webhook at ngrok or creating triggers on real accounts.
- Done when: tests cover signature verification (valid, bad, missing secret), unknown accounts, and the trigger query builder; all gates pass.

## Phase 9: daily cron and "new account detected"

- Cron becomes `0 1 * * *`. It queues one `gmail.discover` job per active mailbox (each calls the web `discover` operation; the logic stays in the web app) plus a catch-up ingest (since the last import minus 1 day) for each active mailbox that has linked accounts. Mailboxes without accounts are skipped.
- Migration: `gmail_institution_discoveries.first_seen_at` and `dismissed_at`. Add `newAccounts` to the connections list, and `PATCH …/discovery/[institutionKey]` to dismiss one.
- The cron reruns imports that failed or never finished. It never retries emails recorded as `failed`.
- Add the badge in Profile with Add and Dismiss.
- Done when: agent and core tests pass, `pnpm db:check` passes, the Wrangler dry-run passes, and finally `pnpm check` and `pnpm build` pass.

## Finish

- Run `pnpm check` and `pnpm build` on the branch.
- Report what was tested, what is still untested against real Composio and the LLM, and which stop-list items are waiting on the user.
