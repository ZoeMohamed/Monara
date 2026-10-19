# Import and extraction

Owner: Adlyn. Features: F2, F3, F8, F14. Status: Draft.

## Purpose

Monara turns institution emails into reviewable financial records and supports a separate WhatsApp receipt-photo path. This section describes parent #85 at `e745247`; it does not incorporate newer main #89 or open voice and extraction-documentation PRs. F8 recurring-bill detection and the voice part of F14 remain Planned in this tree; the [spending forecast](forecast.md) does not create confirmed Recurring Bills.

## How it works

Google sign-in and Composio Gmail authorization are separate. The backend resolves an active connection to its owner and Financial Accounts. `apps/agent/src/gmail/pipeline.ts` lists only exact senders registered for those accounts in `packages/contracts/src/institutions/institution-senders.json`. Initial import covers 30 days; later syncs overlap the previous cursor by one day, bounded by that same window. A daily job and provider triggers use the same import boundary.

`packages/core/src/gmail-connections.ts` enforces up to three active Gmail connections, verifies the completing provider session belongs to the signed-in User, and revokes provider access before marking a disconnect successful. Connection status and sync counts are exposed through backend APIs; inactive connections stop queued imports while retained message identifiers prevent reimport duplicates.

Messages are claimed before extraction. A unique connection/message pair and unique processed-message/item-index pair make replay idempotent. The pipeline rechecks connection activity around provider calls, skips known non-transaction subjects, parses batches, and queues categorization separately. Retry recovery also requeues persisted items whose categorization has not finished.

`apps/agent/src/gmail/email-text.ts` removes HTML and boilerplate and bounds the body to 4,000 characters. The structured extractor in `apps/agent/src/gmail/parse/extract.ts` has no tools. It treats email text as untrusted data and returns at most 20 items. Code parses whole IDR amounts, requires copied amounts and locations to appear in the text, and rejects implausible dates. A guarded field caps extraction confidence at 0.5. These checks constrain model assertions; they do not independently prove every semantic interpretation.

The Next.js backend persists each Gmail item pending with extraction evidence. Categorization then selects an active owned Category and compatible transaction type. `apps/agent/src/merchant/pipeline.ts` first tries deterministic Internal matching; otherwise a model classifies the individual transaction. The only reusable cache contains public business-search evidence, not earlier AI classifications or the User's merchant corrections. User edits stop automatic application to that item.

Import progress waits for extraction and categorization. A null choice or exhausted classification retry becomes terminal `needs_review`; a pending financial record does not keep the sync running. The SQL status function counts unresolved review separately from active work in [the typed-categorization migration](../../supabase/migrations/20261019120000_typed_gmail_categorization.sql).

For receipt photos, `apps/agent/src/whatsapp/receipt.ts` reads media from a verified linked sender in the User's conversation. Bytes remain in memory; the backend operation `add_receipt_transaction` sets the source and always creates a pending record. The WhatsApp message ID supplies the idempotency key. Account matching requires a single active last-four match or a single matching account-name hint. Unreadable amounts save nothing. This is a separate reader with different guards, rather than Gmail extraction reused unchanged.

## Key decisions

- Require two confidence gates instead of treating extraction confidence as sufficient. In this frozen tree, [the authoritative helper](../../supabase/migrations/20261017070000_harden_gmail_auto_confirm.sql) returns **0.95** for extraction, and classification must also reach **0.95**. The earlier 0.9 migration is superseded. Compatible classification is required; merchant-history category reuse is not the policy.
- Require an authenticated sender, complete stated IDR facts, merchant or description, and a mapped active owned account in addition to confidence. `apps/agent/src/gmail/sender.ts` checks aligned DKIM or SPF in Gmail's trusted authentication result. One account for the institution/mailbox may resolve without last four; multiple candidates need a unique last-four match. Missing or ambiguous mapping remains pending.
- Make Internal the only automatic exclusion instead of excluding all model-labelled transfers. [Flexible holder matching](../../supabase/migrations/20261019140000_flexible_gmail_holder_matching.sql) checks the stored counterparty against the confirmed profile name: exact normalization, or a complete word subset containing at least two distinct substantive words, allowing one character edit in at most two words. A shared word or initials are insufficient. Description, transfer flag, counterparty type, and cash direction are not additional Internal prerequisites. Known direction is preserved. Other exclusions require review; every confirmed exclusion stays outside totals.
- Search a bundled public brand instead of trusting a model's business label. `businessSearchName` in `apps/agent/src/merchant/categorize.ts` permits an exact catalog label or alias and sends only its canonical name to Brave. Personal names, account identifiers, email content, amounts, and descriptions never enter that search query.
- Keep media writes pending instead of using the general confirmed chat-write operation. Receipt confidence cannot bypass User review. Voice remains Planned: [#74](https://github.com/ZoeMohamed/Monara/pull/74) and its transcription layer [#78](https://github.com/ZoeMohamed/Monara/pull/78) are open dependencies, not evidence of shipped audio support.

## Security and risks

Confidence is model-reported, not calibrated accuracy. Prompt delimiters, strict schemas, source checks, owned IDs, and backend validation reduce risk but cannot establish injection immunity. Open [#75](https://github.com/ZoeMohamed/Monara/pull/75) adds further prompt handling and an attack suite; its results are not current-tree acceptance. Open [#73](https://github.com/ZoeMohamed/Monara/pull/73) also describes unmerged voice behavior and stale category gates, so its prose cannot replace source verification.

The latest typed-category migration leaves absent Gmail dates unknown and requires an extracted date for auto-confirm; older rows can retain earlier timestamp defaults. The receipt reader still defaults missing or rejected dates to today in Jakarta. That receipt value is a review default, not an extracted fact. Owners must review this gap against F14's nothing-guessed requirement.

Main [#89](https://github.com/ZoeMohamed/Monara/pull/89), absent from #85, changes the extraction threshold to 0.5 and adds typed confidence fallbacks and import-reliability changes. It needs owner integration and renewed verification before those policies can describe the submission tree. This reconciliation remains Draft pending Adlyn's review. Live Composio authorization, queue recovery, provider retention, and end-to-end receipt delivery require environment-specific evidence.

## How to verify

Run `pnpm --filter @monara/agent test` and `pnpm --filter @monara/core test` for fake-backed extraction, sender, categorization, persistence, and receipt boundaries. Relevant tests include `apps/agent/test/gmail-extract.test.ts`, `merchant-pipeline.test.ts`, and `receipt.test.ts`.

On an agreed disposable local database, run `pnpm db:check --reset`. Inspect `supabase/tests/database/gmail_typed_categorization.test.sql` and `gmail_flexible_holder_ownership.test.sql`: qualifying classification confirms, incompatible categories or direction fail, Internal requires matching evidence, other exclusions need review, retries deduplicate, edits survive, and terminal review completes progress. This is a verification procedure, not a claim that a database replay ran during this docs reconciliation. Historical labeled-email measurements and their limitations belong in [evaluation](evaluation.md); no new model run or accuracy percentage is claimed here.
