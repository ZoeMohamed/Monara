# Reminders

Owner: Abhip. Features: F13. Status: Draft.

## Purpose

F13 warns about Budget thresholds and due Recurring Bills. On `origin/main` at `c9e5ea0`, Budget threshold creation, owned in-app read/archive operations and optional WhatsApp dispatch are implemented. The production Worker reports the configured 15-minute schedule, but template approval, provider delivery and a successful valid-recipient send were not exercised. Bill-due scheduling and full F13 policy acceptance remain Planned, and owner review remains outstanding.

## How it works

**Creation.** [finance.ts](../../packages/core/src/finance.ts), `evaluateBudgetThresholdsFor`, evaluates confirmed expenses when financial changes affect Budget usage. It compares usage in the relevant weekly/monthly Budget period with the configured warning percentage and 100%. Pending transactions and exclusions do not contribute. A backdated expense evaluates its own period, not the date the Reminder was created.

The durable key includes Budget id, period start, limit and threshold: `budget:<id>:<period>:<limit>:<threshold>`. A repeated evaluation does not create another Reminder for the same key. A changed limit creates a new key. The stored Reminder remains available in the app even if WhatsApp cannot send; read/archive acknowledge it without paying a bill or changing financial records.

**Optional WhatsApp copy.** [budget-alerts.ts](../../packages/core/src/budget-alerts.ts), wired through [web scheduling](../../apps/web/src/lib/whatsapp/budget-alerts.ts), runs after the response so provider latency cannot fail the financial write. Missing configuration or an absent verified, opted-in recipient causes no send. The backend reserves one `reminder_deliveries` row per Reminder/channel and claims it conditionally before delivery.

| Stage | Implemented behavior |
| --- | --- |
| Quiet hours | 22:00-07:00 in fixed Asia/Jakarta; leave the delivery queued. |
| Daily cap | At most three sent/in-flight claims per User's Jakarta day; excess rows are skipped as `daily_limit`. |
| Provider boundary | Mark `sending`, decrypt the linked number and send the `budget_alert` template with Budget name, usage, limit, remaining amount and period end. |
| Settlement | Store `sent`, `skipped` or `failed`, with a provider message id on acceptance or a short failure code. |
| Recovery | Safely reclaim a pre-provider claim after five minutes; never resend a stale `sending` row whose result is unknown. |

The [Worker dispatcher](../../apps/agent/src/reminders.ts) calls the credential-protected `/api/agent/reminders/dispatch` every fifteen minutes, as declared in `apps/agent/wrangler.jsonc`. Outside quiet hours the backend processes up to fifty queued rows. The production Worker inspected for this reconciliation reported the same cron and baseline commit, so deployment configuration is present. A configured schedule still does not prove the provider accepted or delivered any message.

Verifying a WhatsApp Link enables its Reminder preference and stores an encrypted recipient. Unlinking clears the recipient. A previously verified link without ciphertext requires relinking for outbound alerts. The service rechecks recipient eligibility for queued delivery.

## Key decisions

- Store the in-app Reminder first instead of making WhatsApp the only channel: quiet hours, caps or provider failures must not hide the warning.
- Reserve/claim before sending instead of retrying the full workflow: duplicate callers share one delivery row. A provider call with an unknown result is terminal because transport idempotency is unavailable.
- Send after the response instead of inside the financial write. This protects saving latency, at the cost of a crash window before a delivery row exists.
- Keep the outbound number encrypted as well as hashed. The keyed hash resolves a sender but cannot reconstruct a recipient; AES-GCM ciphertext enables authorized sending.

## Security and risks

The dispatch endpoint requires the server-only Agent credential. [The repository](../../packages/core/src/supabase-budget-alert-repository.ts) scopes recipient, preference and delivery queries to the owning User. `WHATSAPP_LINK_SECRET` protects both keyed recognition and encrypted numbers; the secret plus database access can recover recipients. Failure records avoid raw provider errors and numbers. Budget names and amounts still reach Kapso and WhatsApp. `sent` records provider acceptance, not delivery or reading.

The implementation differs from the PRD: it always uses a template, fixes the timezone to Jakarta, skips excess alerts instead of combining a summary, and has no separate settings/chat opt-out beyond unlinking. These gaps remain Planned. There is no `bill_due` producer, payment matching or bill schedule. Demo personal-reminder editing does not establish persisted scheduling. A crash before post-response reservation can leave an in-app Reminder without an outbound row to retry.

## How to verify

Run `pnpm --filter @monara/core test` and `pnpm --filter @monara/agent test`. [Core tests](../../packages/core/src/budget-alerts.test.mjs) exercise quiet-hour release, the cap under concurrent claims, one send per Reminder, template parameter order, unlinked/opted-out recipients, safe pre-provider retry, terminal unknown outcomes and redacted failures. [Dispatcher tests](../../apps/agent/test/reminders.test.ts) use a fake backend. [Database tests](../../supabase/tests/database/initial_schema_rls.test.sql) cover ownership and delivery constraints; running them requires an agreed disposable local stack.

For in-app acceptance, confirm an owned expense at each threshold, repeat evaluation and verify one stored Reminder per key; change the Budget limit and period, then check read/archive and another User's rejection. Real WhatsApp acceptance additionally needs an approved template, verified opted-in recipient and send/quiet-hour evidence. Deployment inspection establishes the schedule only; fake tests and a passing build do not establish delivery.
