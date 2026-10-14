# Monara next steps — 11 October 2026

> Current checkpoint — 14 October 2026: earlier sections are a dated implementation journal, including superseded visual iterations, validation counts and branch state. The current [UI design system](ui-design-system.md), [UI technical draft](tech/ui.md) and [backend handoff](ui-backend-handoff.md) describe the reconciled implementation. Google Auth, schema/contracts, Gmail connection APIs, financial backend operations and the Agent runtime now exist; rich financial screens still use labelled sample state, and Gmail/Chat screen adapters remain incomplete. The supplied SVG lockup/Nunito Sans, static landscape/simple mascot and all financial visualizations remain. The final live tracker refresh on 14 October marks ZO1–ZO8 and ER1–ER3/ER11 Done, ZO9 Not started, and ER4–ER10/ER12 In progress; no external statuses or deadlines were changed by this review. These historical checks do not prove acceptance of the newly combined implementation.

Erdafa / Daptek has now implemented the **ER4 presentation screens** and the **ER10 cache-safety slice** locally. ER5 now has a working session-only Review Queue. Next, connect ER4/ER5 to Zoe’s verified authentication and financial operations and Adlyn’s Gmail services after their shared contracts are agreed. The screens currently show explicit unavailable states; they do not authenticate users or connect mailboxes.

This is a dated research and implementation audit, not a replacement PRD or proof of deployed features. Existing implementation changes remain local and uncommitted. This review did not connect accounts, provision infrastructure, send messages, update the external tracker, or deploy anything.

## Sources and scope

The review refreshed all six tabs of the [main document](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit): PRD, Action Tracker, ERD, environment configuration, Brainstorm, and Reference Last Year. The ERD is an embedded diagram; it was inspected visually because its plain-text export is empty. Environment values were omitted from output. Both tabs of the [registration workbook](https://docs.google.com/spreadsheets/d/1L9ygKAnIEBNVmb43E-9ySBljWUFalxzM/edit?gid=1777713568) were checked, with personal registration entries omitted. The [competition rules](https://docs.google.com/document/d/10j39ZwSaLDPC8GEGgLMIeq4GXPoge4_W/edit) and repository instructions, architecture, ownership, glossary, and implementation were also reviewed.

The current product reference is [PRD v2.1, dated 11 October](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit?tab=t.7t8u9nqsrfc), together with the [updated action tracker](https://docs.google.com/document/d/1JPvoReZT6AZJ6YAJz6nbJk5kblqoGbj7ztX1LPn5lBE/edit?tab=t.5tiin0qzk1mg). Brainstorm and last-year comparisons contain ideas that the current PRD cuts. Keep English UI, IDR only, private single-user records, expense/income/transfer, and human review of every extraction. Do not reintroduce investments, WeChat, stored account balances, shared spaces, or multiple currencies from those older notes.

## What is actually implemented

| Area | Evidence in this checkout | Limit |
| --- | --- | --- |
| ER1–ER3 | HeroUI 3.2.6, shared exports/theme, white and blue light UI, English product and accessible copy, migrated controls | Prototype UI; no live services |
| ER11 | User-selected cat logo and raster app branding | Local implementation; submission packaging remains |
| ER4 | Sign-in/Gmail routes; mailbox limit, reconnect, sync counts, disconnect and progress/error fixtures browser-verified | Live auth, Gmail ownership/operations, and agreed transport contracts remain absent |
| ER5 | Pending-only queue, edit/save/confirm, rejection confirmation, missing-field validation and flags; confirmed-only sample ledger | Session-only state; durable rejection/dedup and real operations await ZO1/ZO6 |
| ER6 | Sample income/spending/difference, pace, category usage and recent records derive from confirmed state; transfers excluded | Fixed sample periods/budgets, illustrative trend; selected-month server aggregates still needed |
| ER7 | No Chat tab | Operational chat endpoint absent; worker scaffold exists |
| ER8–ER9 | Static category budget presentation | No budget/bill management, WhatsApp linking, reminder settings/list |
| ER10 | Manifest, install guidance, public-asset-only worker cache, generic offline page, nine worker boundary tests | Actual mobile/device interaction and browser network-offline behavior remain unverified |
| ER12 | `docs/tech/ui.md` now Draft, with matching README status and code/test links | Planned features and mobile/device limitations documented; not reviewed/final |
| AB3 support | Local migration validator, CI job, script tests, type-drift checks | No SQL migrations, live policy tests, or generated schema baseline; gate currently skips |
| Backend/providers | Workspace and boundary scaffolding | No financial operations, auth handlers, provider implementations, or durable workflows |

Evidence: [shared UI](../packages/ui/src/index.ts), [theme](../packages/ui/src/theme.css), [web implementation](../apps/web/src/components/monara-app.tsx), [sample model](../apps/web/src/data/sample-data.ts), [contracts](../packages/contracts/src/index.ts), [core](../packages/core/src/index.ts), [API boundary](../apps/web/src/app/api/README.md), [agent entry](../apps/agent/src/index.ts), and [migration gate](../scripts/check-db.mjs). The worker exposes a scaffold health response and returns 501 for other operations. Supabase client constructors alone do not implement authenticated repositories.

### Shared repository integration

After refreshing remote refs, local HEAD is `341bcda`; `origin/main` is `fe58adc`, three commits ahead. Abhip's merged documentation work (#7) adds the technical-documentation skeleton, a repository tech-doc skill, expanded glossary, and `docs:check` with CI wiring. The upstream UI document was a TODO stub assigned to Erdafa; it is now a local Draft describing implemented and Planned behavior. `origin/ui-test-clone` contains an older richer sample UI and an ERD design document, but no additional auth, financial backend, provider or agent implementation was found there.

The tracked local diff was backed up before integrating upstream file contents into the working tree. The combined `package.json` and `.github/workflows/ci.yml` retain `docs:check`, explicit `pnpm run doctor`, and the local database-validation CI job. Git history is unchanged: no merge, rebase, branch switch, commit, or PR was performed. Keep HeroUI/English UI work separate from AB3 validator work when packaging reviewable changes.

### Concrete gaps that matter next

1. **Sample summaries now follow confirmed state.** Home, ledger spending, income/difference, and category usage derive from the same synthetic records. Pending/rejected records are excluded, and transfers contribute zero to income/spending. The trend is labelled illustrative. ER6 still needs actual selected-month aggregates from ZO7.
2. **The manual form is still a demo boundary.** It now collects explicit type, amount, date, currency, Financial Account, and optional category/source. Valid manual sample records confirm immediately. Account labels and two supported transfer pairs are synthetic presentation options, not authorized resource IDs or final ZO1 contracts.
3. **Confidence and review status are separate.** Every synthetic import is pending, including 99%-confidence income. Incomplete values remain null, confirmation validates required fields, and edited records remain pending until confirmed. Rejection is retained only for this session; permanent dedup requires the backend.

4. **Offline cache boundary is now implemented.** The v4 worker never stores application navigations, auth/API responses, or RSC payloads. It fetches an explicit public-asset allowlist without credentials and rejects private/no-store, redirected, failed, or wrong-MIME responses. Offline navigation uses only generic `offline.html`; activation removes old Monara caches while preserving unrelated caches. Nine tests execute the actual worker source, including runtime storage-failure cases. The Cache API does not automatically honor HTTP caching headers, so this boundary is explicit. [MDN Cache reference](https://developer.mozilla.org/en-US/docs/Web/API/Cache).

## Your implementation order

| Order | Task | Concrete acceptance evidence | Dependency |
| --- | --- | --- | --- |
| 1 | ER10 cache boundary, small early slice | Only explicit public assets and a generic offline fallback are cached; auth callbacks, personalized HTML/RSC, financial APIs, and auth responses never enter Cache Storage | Must land before live ER4 integration |
| 2 | ER4 sign-in + Gmail screens, due 14 Oct | Separate sign-in/connect actions; signed-out/loading/error states; mailbox status, last sync, reconnect, disconnect, Sync Now progress and completed counts; clear fourth-mailbox refusal | ZO1 contracts, ZO5 auth, AD1 connection; AD2 sync results |
| 3 | ER5 Review Queue, due 15 Oct | Pending-only list; field warnings; edit, confirm, reject; incomplete items cannot confirm; rejected items do not return | ZO1 DTOs and ZO6 operations |
| 4 | ER6 monthly dashboard, due 15 Oct | Income, spending, difference, categories and recent records match confirmed ledger for selected month; pending/rejected and transfers contribute zero to expense/income totals | ZO7 aggregates, based on ZO6 |
| 5 | ER7 Chat tab, due 15 Oct | Real request/progress/error states, action echo, undo, specific destructive confirmation; UI offers no credential actions in chat | AR1 endpoint and subsequent tool behavior |
| 6 | ER8–ER9, due 16 Oct | Budget/bill management, verified WhatsApp linking, preferences and in-app reminders | ZO8, AD6, AR6, AB4 |
| 7 | ER12 docs, due 16 Oct; ER10 final QA, due 18 Oct | `docs/tech/ui.md` accurately describes screens and limitations; production PWA and physical/mobile interaction evidence | Completed feature work |

ER4 presentation states and ER5 sample interactions are implemented and verified locally. Keep unfinished actions clearly unavailable until their service exists. The 14 October foundation checkpoint expects a usable review flow even though ER5's full deadline is 15 October: aim to demonstrate one persisted pending → confirmed transition with correct totals by the checkpoint.

For fixture verification, the current sample's reviewed amount is Rp397,490; confirming the Rp28,000 Kopi item should make it Rp425,490. These are sample-only checks. New canonical income and transfer fixtures are also needed to prove their separate treatment; the existing six expense-like rows cannot prove the whole PRD.

## Handoffs to request from teammates

### Zoe — ZO1/ZO3 first, then ZO4–ZO7

Agree the contracts by 12 October: UUID resource IDs; transaction kind; pending/confirmed/rejected state; exact IDR money representation; canonical dates/timezones and date-only precision; nullable uncertain fields; owned account/category selection; related transfer records; operation responses and explicit errors. Decide a bounded integer rupiah or decimal-string representation consistently across Zod, SQL, extraction and totals. This is an implementation recommendation for Zoe to settle, not an additional product requirement.

The existing review schema only accepts `pending` and `confirmed`; durable `rejected` is still missing. The contract also lacks transaction amount, date, kind, and operation DTOs. Freezing those concrete shapes is the handoff that lets UI and Agent implementation proceed safely in parallel.

Auth and Gmail DTOs need enough information for ER4, review DTOs enough for ER5, and selected-month aggregates enough for ER6. The server must derive the User from verified identity and validate every owned resource. A schema-valid `userId` supplied by a caller is not authorization.

The current ERD needs ZO3 reconciliation: bigint resource IDs versus UUID contracts, stored `current_balance`/`balance_as_of` versus the explicit no-balance scope, missing processed-Gmail and WhatsApp/verification entities, and missing reminder/action logs. Transfer linkage, pending nullability, confirmed constraints, uniqueness, and same-user relationships need actual SQL; the diagram alone cannot prove them.

For ZO4, test allowed and denied CRUD under `anon` and `authenticated`, including User A versus User B, owner reassignment, cross-user account/category references, and dashboard isolation. Grants and RLS both matter; a service role bypasses RLS. If aggregate views are exposed, review `security_invoker` behavior. [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

### Zoe — ZO5 Google sign-in

Installed versions are Next 16.3.8, `@supabase/ssr` 0.12.7, and `@supabase/supabase-js` 2.117.3. Use request-scoped clients and the current `proxy.ts` pattern, preserve refreshed cookies and cache headers, and authorize endpoints independently. `getClaims()` verifies JWT claims; `getUser()` gets current Auth state, useful where prompt revocation matters. Do not authorize from `getSession().user` alone. [SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [revocation/caching guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide), [Next authorization](https://nextjs.org/docs/app/guides/authentication).

Keep redirects distinct: Google's authorized callback goes to Supabase `/auth/v1/callback`; Supabase's allowlisted `redirectTo` goes to Monara `/auth/callback`, which exchanges the code and writes cookies. Worktrees need their assigned local ports, rather than a hardcoded shared port. Google sign-in does not connect Gmail. [Supabase Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google).

### Adlyn — AD1/AD2/AD4 Gmail

Current Composio guidance prefers sessions and `session.authorize("gmail")` for new integrations. Verify callback results against a server-stored attempt and signed-in User; callback query parameters are not ownership proof. Disable in-chat connection management to preserve Monara's T3/web-only boundary. [Manual authentication](https://docs.composio.dev/docs/authentication/manually-authenticating). Older `initiate()` examples require care: managed OAuth now uses Connect Links, while `initiate()` remains for custom OAuth and other schemes. [Direct-auth migration guidance](https://docs.composio.dev/docs/tools-direct/authenticating-tools).

Pin the selected mailbox explicitly; the default may choose the most recently connected active account. Enforce the three-mailbox cap server-side too. [Multiple connected accounts](https://docs.composio.dev/docs/authentication/managing-multiple-connected-accounts).

Managed polling has a 15-minute minimum interval in current Composio guidance. Show progress and the actual last sync rather than promising instant imports; select a custom-auth/trigger path only when its setup is agreed. [Managed versus custom authentication](https://docs.composio.dev/docs/authentication/custom-app-vs-managed-app).

Recommended dedup design: keep the app's mailbox identity stable across provider reconnects, and uniquely identify processed messages by User, stable mailbox, and Gmail message ID. Do not key only on a provider connection that changes on reconnect. Atomically record extraction results and processed-message state; preserve rejection. Gmail message IDs are immutable. [Gmail message identity](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages).

Freeze the initial 30-day cutoff server-side, use an epoch-based query where appropriate, and paginate fully; date-only Gmail search uses PST. Manual and automatic sync should use the same durable rules and report actual counts. Request only the permission required to read the messages needed for extraction. [Filtering](https://developers.google.com/workspace/gmail/api/guides/filtering), [pagination](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list), [scopes](https://developers.google.com/workspace/gmail/api/auth/scopes).

### Argya / Abhip — external lead times and CI

AR2's connected number and AR10's two templates are due **12 October**. Kapso's current documentation says template reviews typically take up to 24 hours, with first approvals potentially longer; it describes explicit syncing and says sandbox-number sync is disabled. I did not find support there for the tracker's fixed 24–48-hour sync claim. Confirm the actual project/number path rather than treating sandbox and a production pre-verified number as interchangeable. [Template lifecycle](https://docs.kapso.ai/docs/whatsapp/templates/lifecycle), [instant setup](https://docs.kapso.ai/docs/platform/phone-numbers/instant-setup).

Outside the customer-message 24-hour window, WhatsApp requires approved templates. Keep in-app reminders working independently. [Kapso service window](https://kapso.com/guides/whatsapp-pricing/how-pricing-works/the-24-hour-window).

Verify Kapso signatures over the raw payload before processing, and use durable idempotency. Provider webhook retries and Cloudflare Queues' at-least-once delivery require atomic deduplication; an in-memory Set or check-then-insert without uniqueness does not establish it. Use runtime-compatible APIs in the Cloudflare worker. [Kapso security](https://docs.kapso.ai/docs/platform/webhooks/security), [delivery](https://docs.kapso.ai/docs/platform/webhooks/advanced), [Cloudflare guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/).

For Zoe's requested CI/validator guidance, [the local workflow](supabase-workflow.md) is ready to share. Use versioned migrations, disposable local replay, SQL lint, real ownership/RLS tests, and generated-type comparison. Current AB3 script tests validate the tooling, not financial security. Hosted deployment remains a separate configured workflow; one coordinated owner should apply reviewed migrations. [Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations), [database tests](https://supabase.com/docs/guides/database/testing).

## Planning and documentation drift

- The external tracker still says ER1–ER3 and ER11 are Not started. Record them as implemented locally and pending team review/integration, rather than claiming merged work. AB3 support is likewise local; its first real schema replay remains outstanding. No tracker edits were made in this audit.
- Repository ownership still assigns Kapso to Farrel and budgeting to Argya. The refreshed PRD/tracker assign WhatsApp to Argya and budget calculations to Zoe. Reconcile ownership documentation with the team; runtime boundaries remain valid.
- `docs/tech/` and `pnpm docs:check` specified by PRD D-031 are now integrated into the working tree. Erdafa’s UI section is Draft. Its normal check verifies structure; `--final` additionally rejects TODOs and unfinished status. Passing the normal check does not mean the technical documentation is finished.
- “Savings rate” is described as income minus spending in F9. Agree whether the dashboard wants the currency difference, a percentage rate, or both, and how zero income behaves.
- The reminder policy's three-message daily cap and combined overflow summary need one precise rule so the summary cannot accidentally become a fourth message.
- AB1 registration is scheduled for **11 October, 20:00 WIB** and remains In progress in the tracker. The competition partner advises registering once the roster is ready and notes registration may close early; Abhip should verify receipt. [IEEE CIS competition notice](https://www.ieee-cis-singapore.org/2026-fintechathon).
- Use **20 October, 22:59 WIB** as the hard deadline: 23:59 Beijing is 15:59 UTC. The supplied rules' rounded 16:00 UTC example is one minute later.

The last-year reference is useful for motivating measurable recommendations. Its primary university source supports FinAgent's bookkeeping, bill-derived profiling, consumption/investment guidance, and multi-agent work; it does not establish Gmail or WhatsApp behavior. Keep those comparisons labeled unknown where evidence is absent. [HKUST(GZ) announcement](https://www.hkust-gz.edu.cn/zh/?p=13630%2F%2F).

## Verification record and limits

The latest implementation verification before this read-only audit passed `pnpm check` and `pnpm build`: 26 script tests, workspace typechecks, Knip/Sherif, React Doctor 100 for web and UI with no findings, Next production build, and Wrangler dry-run build. Biome retains one pre-existing warning in `pwa-register.tsx`; lint exits successfully. Database validation currently skips because there is no SQL schema. These passes describe the local source before integrating the newer main documentation gates; rerun the relevant gates after that integration.

Previous browser checks covered desktop navigation, search, sample review/add, field errors, modal focus/Escape, English accessibility copy, install guidance, light appearance, and the v2→v3 service-worker update. Static 320px layout fixtures passed overflow checks, but native viewport resize timed out: actual mobile interactions and physical installation are not verified. This audit refreshed the local production-mode page and observed no console/network diagnostics there. No live auth, RLS, Gmail, WhatsApp, agent, financial persistence, or deployed functionality has been demonstrated.

Suggested foundation-checkpoint evidence: User A signs in, adds a confirmed IDR expense, edits and confirms a synthetic pending import, sees exact monthly totals, rejects another import, and cannot access User B's data. Once that works, add Gmail ingestion and prove re-sync does not duplicate or recreate rejected items, then expose the same operations through in-app Agent chat.


## Continuation verification — 11 October

The latest local full checks pass with 52 tests: 26 existing script tests, 17 review/model tests, and nine worker tests. React Doctor scores 100 for web and shared UI with no findings. Next.js production build and Cloudflare dry-run build pass. PWA registration retains its existing non-failing Biome console warning; Node also emits a non-failing module-type warning when importing the demo TypeScript in tests.

Browser fixtures exercised sign-in unavailable/progress/error states; Gmail loading/error/signed-out/empty/three-mailbox states, exact callback IDs, sync counts, pending-control disabling, and disconnect cancellation/Escape/focus return. The temporary fixture route was removed before the final build. Review checks exercised save without confirmation, missing-field validation/focus, the exact Rp28,000 confirmation delta, income and transfer behavior, rejection/cancel, and the empty queue. Date typing is unsupported by the native automation tool; the missing-date form fixture used its native browser evaluation API to set a synthetic date.

The production cache contains only generic `offline.html`, manifest, and icons. Worker network-failure/cache-failure behavior is tested in the Node harness. No browser network-offline or physical-installation claim is made.

User direction: mobile users first, with compact spacing similar to Aiccountant/Oyen. Header, cards, typography and vertical gaps are reduced; related summary cards share a mobile row and HeroUI buttons retain a 44px minimum. Native viewport resizing repeatedly times out. Mobile layout snapshots use actual page markup and CSS in a script-free frame at measured 320px/390px widths; full mobile browser interaction remains unverified. Public design reference: [Aiccountant product page](https://aiccountant.id/en).

ER4/ER5 remain partial until verified server identity, ownership, persistent operations, OAuth handling and durable rejection/dedup are wired. ER12 is now a Draft in [docs/tech/ui.md](tech/ui.md), written with the repository tech-doc skill. No commit, push, deployment, remote migration, or messages were performed.

The user selected `logo-1.png` from the shared Nextcloud link and requested the palette to match it, with no decorative shadow/glow. The original artwork is retained; primary actions use its dominant royal blue `#0b33fd`, with pale cyan surfaces. Shared HeroUI shadow tokens preserve accessibility rings. Page-rise animations are removed, touch controls retain 44px targets, and safe-area/input platform fixes follow the explicitly requested Emil skills. Physical device behavior remains pending.


## Continuation — 11 October, evening

ER6–ER9 presentation is implemented locally on sample data. Home has month selection with an empty state. Budgets shows category budgets with Near limit/Over budget labels, safe to spend today, and recurring bills with a confirm-or-dismiss suggestion. Chat has prompts, progress, and a clear Agent-not-connected error. The header bell lists Reminders built from the PRD F13 triggers and templates. Profile shows connection status and Reminder preferences. Budget and bill fields follow the ERD tab. `pnpm check` (56 tests, React Doctor 100/100) and `pnpm build` pass. Browser checks at 390px and 320px found no overflow or clipped text.

Still needed from teammates before these become live: ZO7 aggregates, ZO8 budget operations, ZO9 insight calculations, AD6 bill detection, AR1 chat endpoint, AR6 WhatsApp linking, and AB4 Reminder delivery. The external tracker was not edited; ER6–ER9 can be marked "In progress (UI ready on sample data)". Emil Kowalski's mobile-native, emil-design-eng, and find-animation-opportunities skills and Jakub Krehel's better-* skills are installed in the user's `~/.claude/skills`, not in the repository.

## Frontend continuation — 13 October 2026

The next frontend pass improves ER5/ER6 and supporting ER8, ER10, and ER12 presentation. It applies the requested UI/UX Pro Max and Emil Design Engineering guidance while retaining the approved white/blue theme. Copy is shorter, fields have visible labels, incomplete operations fail clearly, and actions expose their state. This is local implementation evidence; the external tracker has not been changed.

The latest brand direction uses the supplied lowercase rounded wordmark. A shared [Logo](../apps/web/src/components/logo.tsx) renders its glyphs as native SVG alongside the existing icon in the header, sidebar, and sign-in screen. No library or font dependency was added.

| Task | Local result | Remaining work |
| --- | --- | --- |
| ER5 — transactions and Review Queue | Confirmed records can be corrected from the shared details sheet. Validation preserves identity/status, changes update all derived totals, and Undo restores only the corrected record when it has not changed again. Search/type filters have clear reset actions. | Verified financial operations, ownership, persistent records, durable review/rejection/dedup. |
| ER6 — Overview and Reports | Category/calendar payment rows open the same details as the ledger. Real routes cover Overview, Transactions, Reports, Budgets, Chat, and Profile; month/type/review and sheet state have canonical URLs and browser history. | ZO7 server aggregates and User-timezone behavior. |
| ER8 — budgets and bills | Exact budget equality says "At limit" with zero left; any actual excess, including Rp1, says over and shows the amount. Budget and bill copy is shorter. The bill calendar shows next confirmed due dates only. | ZO8 budget editing/storage, AD6 real bill detection, AB4 delivery. |
| ER10 — interaction and recovery | Empty views offer Add, review imports, or Gmail connection. New drafts start in the selected month. Pending/new drafts survive history traversal in memory; failed saves keep entries, show an error, and allow retry. Saving blocks repeated submission; explicit cancellation checks unsaved changes. | Physical-device installation/keyboard/touch checks and live connection-loss recovery. |
| ER12 — technical documentation | [UI/PWA draft](tech/ui.md) describes the new behavior, links code/tests, and separates local evidence from Planned services. | Owner review and final submission gates. |

The [navigation model](../apps/web/src/data/app-navigation.ts) validates months, types, UUIDs, and mutually exclusive sheets. Generated URLs contain only allowlisted navigation fields; merchant names, amounts, raw searches, and form drafts remain out of URLs. This does not authorize access to financial records. [Shared layout state](../apps/web/src/components/monara-app.tsx) is synthetic and resets on reload; no auth, financial backend, Gmail/WhatsApp provider workflow, or durable persistence was implemented here.

Final verification: `pnpm check` passed with 81 tests and React Doctor 100 for web and shared UI. The Next.js web production build passed and generated all routes statically. Navigation boundary tests include malformed inputs, roundtrips, sheet precedence, clearing state across routes, and private-field exclusion. Correction tests cover exact totals, date/category movement, transfer exclusions, and stale Undo. Earlier dated records above remain historical evidence.

Production browser checks on local port 3100 verified direct Reports/month/Spotify-detail links without hydration or console errors. The Digital → Netflix → Edit flow changed Rp186,000 to Rp190,000, showed the update message and canonical details URL, and returned focus to the Netflix row on Escape. Undo restored Rp186,000 and the Rp397,490 spending total. A changed merchant triggered Discard changes; Keep editing retained the field, while explicit discard restored the row and original data. Direct-link sheets returned focus to main content when no opener existed.

Development checks verified Back/Forward draft retention, search "Jago" plus the Expense filter across a Reports roundtrip, Reject/Reminder sheet history, and closing a missing-record reject link. A temporary failed-save fixture retained the entered merchant, Rp52,000 amount, and date, displayed a short error, and then accepted a retry; it was removed before the production build. Script-free layout frames at 320px and 390px showed no overflow across main views and the editor. These frames verify layout, not actual mobile touch, keyboard, installation, live backend, or deployed behavior.
