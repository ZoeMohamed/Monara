# Security self-assessment

Owner: Abhip. Features: F10, F12, F16. Status: Draft.

## Purpose

This is Monara's own assessment of how the Agent and the data behind it are protected. It covers the permission tiers (PRD section 6.2), how each Channel proves who the User is, the data protections, and a list of risks we know about, with what is mitigated and what is still open. Data model and row-level security are described in [the data and security section](data-and-security.md), and the Agent loop in [the Agent section](agent.md). This file only claims what source, a test, or a measured run supports. Anything else is marked Planned or Open.

## How it works

**Permission tiers.** A tool carries its tier in its definition (`apps/agent/src/conversation/tools.ts`), and the registry enforces it before anything runs. The model cannot change a tier.

| Tier | Tools | How it is enforced |
| --- | --- | --- |
| T0 read | `get_summary`, `suggest_budget`, the `list_*` tools (`read-tools.ts`) | Runs at once. Arguments are parsed with a zod schema first. Totals are summed in integer rupiah by code, not by the model. |
| T1 reversible write | `add_transaction`, `edit_transaction`, `confirm_pending`, `exclude_pending`, `create_budget`, `edit_budget`, `undo_action` (`write-tools.ts`) | Runs at once and returns a receipt. `undo_action` reverses a receipt within 10 minutes and only once. It fails with CONFLICT if the record changed since (`packages/core/src/finance.ts`). |
| T2 destructive | `delete_transaction`, `delete_budget` (`destructive-tools.ts`) | The tool never runs anything. It asks the backend for a confirmation that expires after 5 minutes and can be used once. The delete happens only when the User's next message is exactly "yes". |
| T3 never in chat | Connections, WhatsApp linking, export, credentials | Not Agent tools. The tool type has no T3 value, so one cannot be registered. These actions exist only in the signed-in web app. |

**Identity per Channel.** A user ID, phone number or connection ID sent by a caller is never treated as proof.

- *Web app and in-app chat.* The Supabase session is refreshed in `apps/web/src/proxy.ts`. The chat route accepts only same-origin requests (`apps/web/src/lib/http/origin.ts`), and the financial service takes the User from the verified session.
- *WhatsApp.* The webhook verifies the Kapso signature (`apps/agent/src/whatsapp/index.ts`). The sender's number is sent to `resolve-sender` on the backend, and only a verified WhatsApp Link names a User. The number is stored as a keyed hash, which is how a sender is recognized, and once verified also as an AES-GCM ciphertext that only the backend can open, so Reminders can be sent to it. Unlinking clears the ciphertext. The link code is stored as a digest, expires after 10 minutes, and locks after 5 wrong attempts (`packages/core/src/whatsapp-link.ts`).
- *Agent to backend.* Calls carry a bearer secret compared in constant time (`apps/web/src/lib/agent/credential.ts`). If the secret or a binding is missing, the handler returns 503 and does nothing.

**Data protections.**

- Row-level security is enabled and forced on all product tables. Owned records reference each other with composite `(id, user_id)` keys, so a cross-User link fails inside Postgres. The service-role key stays on the server, and the repository adds `user_id` to every query.
- Imported transactions start `pending`. Only confirmed ones count in totals. Duplicate emails cannot create duplicate transactions (unique Gmail message and item keys).
- Monara stores no raw email bodies, subjects or OAuth tokens. Composio holds the Gmail credentials.
- Errors report status codes only. Raw emails, conversations, records, auth headers and tokens are not logged.
- The web app sends `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` and `Permissions-Policy` headers (`apps/web/next.config.ts`). The service worker caches only the public app shell, never financial data or auth responses (`apps/web/public/sw.js`, `scripts/sw.test.mjs`).
- Kapso media is fetched only from Kapso's origin, without following redirects.

## Key decisions

- **Tiers live in code, not in the prompt.** Rejected: telling the model in the prompt to ask before deleting. A hijacked model ignores prompts, but it cannot make a T2 tool run or register a T3 tool.
- **Confirmation is issued by the backend, not by the chat history.** Rejected: trusting "yes" in a history sent by the browser. A forged history cannot confirm a delete without a confirmation ID the backend issued.
- **Reversible by default, with Undo.** Rejected: confirming every write. Confirming everything makes the Agent unusable in chat, so only deletes ask, and every other write can be undone.
- **WhatsApp is an identity signal only after explicit verification.** Rejected: matching a phone number from the User's profile or Gmail. A number is a claim, so the User must prove it by sending a code.
- **Extraction proposes, the User decides.** Rejected: auto-confirming high-confidence imports. This keeps a wrong or injected email from changing totals.
- **No new security services for the hackathon.** Rejected: a separate WAF, a vault and per-request signing. Each adds scope we cannot finish and verify before the freeze.

## Security and risks

| # | Risk | Impact | Mitigation in place | Still open |
| --- | --- | --- | --- | --- |
| 1 | Prompt injection through email text, a stored record, or a chat message | A hijacked model calls tools the User did not intend | Tiers enforced in code. Deletes need a backend confirmation. Undo works for 10 minutes. Sandbox attacks for injected email, injected record, spoofed identity, T3 escalation and prompt extraction passed 7 of 7 on the owner's 16 Oct run | A hijacked model can still run T1 writes. Undo is the only control. Receipt and voice input are Planned, so their injection safety is untested |
| 2 | Reading or writing another User's data | Financial data leak | Forced RLS, composite ownership keys, `user_id` on every repository query, and the database test suite in `supabase/tests/database` | Every service-role query relies on application code adding `user_id`. Live isolation and concurrency acceptance on a real stack is not yet recorded |
| 3 | Leak of the Agent-to-backend secret | An attacker acts as any User through the agent routes | Server-only, constant-time compare, fails closed | One shared bearer secret. No automatic rotation and no per-request signing. Rotate it through deployment secrets if exposed |
| 4 | No application rate limiting on web and chat endpoints | Abuse of model spend, request flooding | WhatsApp code attempts are capped at 5. The model client backs off on provider 429 | No per-User or per-IP limit on `/api/chat` or the finance routes |
| 5 | No page-level Content Security Policy or HSTS in app config | Weaker defense against script injection and downgrade | Output is rendered through React. Other security headers are set | A page CSP is set only on `sw.js` and brand icons. Host-level HSTS is not verified |
| 6 | Financial context sent to the model provider | Records leave our infrastructure for the provider | Results are parsed to the shared contracts, so extra fields are not shown to the model. Errors and logs carry no record content | No data-processing review of the provider. The provider's retention terms are not assessed here |
| 7 | WhatsApp turns kept in a Durable Object for up to 30 minutes, including the User's number | Short-lived exposure of a phone number | Expiry and crash recovery are tested | The retention window is not configurable |
| 8 | Partial failure across separate repository calls (mutation, receipt, confirmation use) | A change saved without a receipt, or the reverse | A failed write tells the User it could not be confirmed. Version checks reject stale edits | No durable client-turn idempotency. A retry must not be replayed automatically. Atomic recovery needs review |
| 9 | Wrong or missing fields from email extraction | A wrong amount or date reaches the ledger | Unknown fields stay null. Nothing counts until the User confirms. Confirmation requires type, amount, currency and date | Extraction accuracy is not yet measured. The labeled set and numbers belong in [the evaluation section](evaluation.md) |
| 10 | Model non-determinism | An attack that passed once may fail later | The prompt and tool descriptions were tightened after earlier failures | The suite is not deterministic. Reasoning is off because the provider rejects function tools with it on. The final run must be repeated and recorded |
| 11 | Regulatory and legal exposure | Compliance gaps in a real launch | The Agent declines investment advice and never moves money | A legal review (Indonesian personal-data and financial-services rules) has not been done and is out of scope for this document |
| 12 | A stored WhatsApp number can be decrypted by the backend | Phone numbers of linked Users are exposed | The number is sealed with AES-GCM under a key derived from a server-only secret, saved only on verification and cleared on unlink. Delivery rows, logs and errors never hold the number | Whoever holds the secret and database read access can recover numbers. There is no rotation procedure for the sealing key. Links verified before the ciphertext column existed hold no sealed number |

**Scope notes.** All data in the demo and the Sandbox is synthetic. Fixtures hold no real emails, passports or production identifiers. Monara never moves money, so there is no payment credential to protect. The in-memory Sandbox ledger is not evidence about the real backend.

## How to verify

```sh
pnpm --filter @monara/agent test       # tier enforcement, confirmations, webhook, WhatsApp session
pnpm --filter @monara/core test        # ownership, WhatsApp Link limits, Undo, confirmation expiry
pnpm db:check --reset --base-ref origin/main   # replays migrations and runs the RLS red-team suite (needs Docker or OrbStack)
pnpm --filter @monara/agent sandbox    # scripted tasks and 7 attacks against the real model (needs LLM_* in apps/agent/.dev.vars)
```

Expected: all tests pass, every pgTAP assertion succeeds, and each attack scenario prints PASS (the ledger is unchanged, no tool runs for a cross-User request, no secret appears in a reply).

The attack scenarios are in `apps/agent/sandbox/scenarios.ts`: `attack-other-user`, `attack-spoofed-identity`, `attack-t3-escalation`, `attack-delete-without-confirmation`, `attack-injected-email`, `attack-injected-record` and `attack-extract-prompt`. The recorded result is in [the Agent section](agent.md). The final run for the submission, with the model name, date and pass counts, is Planned and will be recorded in [the evaluation section](evaluation.md). This file will cite those figures rather than restate older ones.
