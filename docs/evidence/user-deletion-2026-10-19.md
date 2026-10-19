# User deletion local verification

The [confirmed design](../user-deletion-design.md) was verified using local synthetic Users and records, local Supabase Auth/Postgres, the local Cloudflare Worker, and a mock Composio HTTP server. No real account, mailbox, WhatsApp message, production database, or cloud configuration was changed. Google eligibility was simulated with locally issued Google-marked claims; the real Google OAuth round trip and real Composio/Kapso acceptance were not exercised.

## Automated checks

- `mise exec -- pnpm check`: formatting/lint, strict workspace typechecks, Knip, Sherif, tests, react-doctor, documentation and migration validation.
- `mise exec -- pnpm build`: Next.js production build and local Wrangler dry-run bundle.
- `mise exec -- pnpm db:check --reset`: disposable local schema replay, SQL lint, ownership/RLS tests and generated-type drift check. The verification script requires the checkout's stack to be stopped first and stops its disposable stack afterward.
- React Doctor reported 100 for both web and UI, with no findings.

The deletion database test covers exact confirmation, acknowledgement, authenticated ownership, denial of browser cleanup access, immediate token rejection, revocation of multiple refresh sessions, bans while pending, every owned table, disconnected Gmail identifiers, cross-User isolation, service-role write fences, lease recovery, the operational drain window, cleanup-metadata erasure and fresh identity registration. Service/repository tests cover provider failures, completion ordering and the requirement for a valid lease with no outstanding cleanup targets. Worker tests cover inactive/unknown identity handling, stale WhatsApp outboxes, late replies, model retry guards, bounded queue batches and authenticated scheduler calls.

## Mobile browser evidence

T3 collaborative preview used a portrait 390 by 844 CSS pixel viewport.

- Profile showed Delete account in its Account section. The demo Profile had no deletion action.
- The final button stayed disabled for a wrong phrase, including with the checkbox checked, and enabled only with `DELETE MY ACCOUNT` and acknowledgement.
- Cancel closed the confirmation and returned focus to Delete account. Database/provider state remained unchanged.
- Direct requests with the wrong phrase or a caller-supplied User ID returned 400.
- Accepted deletion immediately removed the synthetic User's Financial Account while another synthetic User's account survived. Auth access was blocked, and WhatsApp purge ran against the real local Durable Object runtime.
- A simulated trigger-removal outage left Deletion in progress and retained cleanup targets. Recovery removed the trigger, revoked/deleted active and disconnected connections, swept an orphan trigger and pending consent account, hard-deleted Auth and removed cleanup metadata.
- A second isolated browser using the old session was redirected to sign-in and its profile-status response no longer identified a live User.
- After re-registering the same test email with a new User ID, the same browser showed empty finances and Step 1 of 4, Connect your Gmail. Old setup flags and amount-display preferences were cleared even when deliberately restored before the new sign-in.
- A simulated lost acknowledgement after the server accepted a second deletion was reconciled using the status receipt. The browser reached the deletion page, Auth cookies were absent and User preferences were cleared.
- The local scheduled Worker entry point successfully called the authenticated backend cleanup processor without a browser.

The two-minute final-inventory gate was subsequently covered by the database suite; it does not provide cancellation or recovery. Real queue retention settings, provider-held copies, logs and backups were not inspected or erased. The design and Privacy Policy distinguish those retention limits from live Monara data deletion.
