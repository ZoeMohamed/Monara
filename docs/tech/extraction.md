# Import and extraction

Owner: Adlyn. Features: F2, F3, F8, F14. Status: Draft.

## Purpose

Monara turns institution emails into reviewable financial records and supports a separate WhatsApp receipt-photo path. This section describes `origin/main` at `c9e5ea0`, including the final Gmail confidence/fallback and source-date policies. F8 recurring-bill detection and the voice part of F14 remain Planned; the [spending forecast](forecast.md) predicts spending but does not create confirmed Recurring Bills.

## How it works

Google sign-in and Composio Gmail authorization are separate. The backend resolves an active connection to its owner and Financial Accounts. `apps/agent/src/gmail/pipeline.ts` lists only exact senders registered for those accounts, including sender lists from the User's owned private bank definitions. Initial import covers 30 days; later syncs overlap the previous cursor by one day, bounded by that same window. A daily job and provider triggers use the same import boundary.

`packages/core/src/gmail-connections.ts` enforces up to three active Gmail connections, verifies the completing provider session belongs to the signed-in User, and revokes provider access before marking a disconnect successful. Connection status and sync counts are exposed through backend APIs; inactive connections stop queued imports while retained message identifiers prevent reimport duplicates.

Messages are claimed before extraction. A unique connection/message pair and unique processed-message/item-index pair make replay idempotent. The pipeline rechecks connection activity around provider calls, skips known non-transaction subjects, parses batches, and queues categorization separately. Retry recovery also requeues persisted items whose categorization has not finished.

`apps/agent/src/gmail/email-text.ts` removes HTML and boilerplate and bounds the body to 4,000 characters. The structured extractor in `apps/agent/src/gmail/parse/extract.ts` has no tools. It treats email text as untrusted data and returns at most 20 items. Code parses whole IDR amounts, requires copied amounts and locations to appear in the text, and rejects implausible dates. A guarded field caps extraction confidence at 0.5. These checks constrain model assertions; they do not independently prove every semantic interpretation. If Gmail contains no usable stated date, ingestion records the email's arrival day in Jakarta as a source-derived fallback; receipt and manual sources do not receive that fallback.

The backend persists each Gmail item pending with extraction evidence. Categorization first applies deterministic Internal matching; otherwise a model selects a compatible owned Category and transaction type for that individual item. Public merchant lookup may use a canonical name from the bundled catalog, but previous model classifications or the User's corrections are not reused as authority. A User edit stops automatic application to that item.

Import progress waits for extraction and categorization. A null choice or exhausted classification retry becomes terminal `needs_review`; a pending financial record does not keep sync active. A qualifying item can move from pending to confirmed only when its original facts, account mapping, Category compatibility and confidence satisfy the database policy.

For receipt photos, `apps/agent/src/whatsapp/receipt.ts` reads JPG, PNG or WebP media from a verified linked sender. Bytes remain in memory; `add_receipt_transaction` always creates a pending record keyed by the WhatsApp message ID. Account matching requires a single active last-four match or account-name hint. Unreadable amounts save nothing, and an absent date remains null for the User to supply during review.

## Key decisions

- Use available Review Confidence instead of requiring two scores. [The authoritative migration](../../supabase/migrations/20261019160000_gmail_confidence_only_review.sql) takes the lower score when extraction and classification are both present, uses the one present score otherwise, and keeps both-absent or below-0.5 results pending. Compatible classification and complete facts remain mandatory.
- Require stated IDR facts, merchant or description, and a mapped active owned account. `apps/agent/src/gmail/sender.ts` records aligned DKIM or SPF from Gmail's trusted authentication result, but authentication is evidence rather than a review gate. One account for the institution/mailbox may resolve without last four; multiple candidates need a unique last-four match.
- Select Internal first through deterministic owner-name matching. Another personal name selects Person; remaining compatible items use a specific Category or typed Misc fallback. Expense, income and exclusion may qualify for auto-confirmation, and every confirmed exclusion stays outside totals.
- Search a bundled public brand instead of trusting a model's business label. `businessSearchName` permits an exact catalog label or alias and sends only its canonical name to Brave; personal names, identifiers, email content, amounts and descriptions do not enter that query.
- Keep receipt writes pending instead of using the confirmed chat-write path. Receipt confidence cannot bypass User review. Voice remains Planned and receives a fixed unsupported reply.

## Security and risks

Confidence is model-reported, not calibrated accuracy. Prompt delimiters, explicit untrusted-data instructions, strict schemas, source checks, owned IDs and backend validation reduce risk but cannot establish injection immunity. A listed sender can still qualify when DKIM/SPF alignment fails, one score can decide when the other is absent, and 0.5 is a product threshold rather than a measured real-inbox boundary.

Gmail's source-arrival fallback is deliberately source-specific; receipt and manual transactions remain undated until review. Historical rows backfilled under earlier rules need a source audit before their dates can be claimed as stated facts. The recorded attack/extraction suite is historical and synthetic and did not measure receipt-photo injection or current-main model behavior. Live Composio authorization, queue recovery, provider retention and end-to-end receipt delivery require environment-specific evidence.

## How to verify

Run `pnpm --filter @monara/agent test` and `pnpm --filter @monara/core test` for fake-backed extraction, sender, categorization, persistence and receipt boundaries. Relevant tests include `apps/agent/test/gmail-extract.test.ts`, `merchant-pipeline.test.ts`, and `receipt.test.ts`.

On a disposable local database, run `pnpm db:check --reset --base-ref origin/main`. Inspect the Gmail categorization, confidence, Custom Banks and source-date pgTAP files: qualifying classifications confirm, incompatible Categories or missing direction fail, Internal requires owner evidence, retries deduplicate, edits survive, and terminal review completes progress. The latest baseline CI passed the database suite, but no new model run or real-inbox accuracy percentage is claimed here. Historical labeled-email measurements and their limits belong in [evaluation](evaluation.md).
