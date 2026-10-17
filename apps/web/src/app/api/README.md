# Backend routes

The Next.js backend lives here. Financial writes belong to these routes, including writes requested by the Cloudflare Agent. Implemented routes and screen adapters do not establish deployed configuration or live-provider acceptance.

| Route | Implemented boundary |
| --- | --- |
| `POST /api/finance/operations/[operation]` | Verifies the Google session, validates the operation input, and calls owned financial account, category, transaction/review, budget, dashboard and notification list/read/dismiss services. |
| `POST /api/agent/operations/[operation]` | Requires the server-only Agent/backend credential, validates the trusted runtime caller and input, and rechecks resource ownership in the financial service. Transaction/budget deletion requires a bound destructive confirmation. |
| `/api/gmail/connections`, `/api/gmail/connections/[connectionId]`, `/api/gmail/connections/callback` | Owned Gmail list, separate consent, callback verification, and disconnect lifecycle. |
| `GET/POST /api/gmail/connections/[connectionId]/sync` | Reads cumulative import counts or queues an owned active mailbox for background ingestion. Queue acknowledgement does not establish completion. |
| `POST /api/chat` | Verifies the Google session and same origin, injects server identity, forwards bounded history with server-only Agent credentials and validates the reply. |
| `GET /api/brands?q=` | Public, session-free search over the bundled Simple Icons (CC0) logo catalog for the logo picker. `/brand-icons/[slug].svg` serves the matching mark from the same bundle, so no third-party logo service is called. |
| `GET /api/health/supabase` | Reports configuration/connectivity availability without returning credentials. |

Google Auth start, callback, and sign-out handlers live under `src/app/auth`. Gmail background ingestion has queue and scheduled handlers in `apps/agent`; configured provider acceptance remains unverified. WhatsApp linking uses `whatsapp/link` (signed-in User) and `agent/whatsapp/resolve-sender` (Agent credential). Durable Undo executes stored, owned receipts. Personal Reminder scheduling, delivery preferences and recurring-bill operations remain incomplete. The Agent may list Reminders; mark-read and dismiss are web-only. The backend allowlist is authoritative.

Keep route handlers thin: validate requests using @monara/contracts, resolve identity and ownership, then call @monara/core services and @monara/db repositories. Financial writes belong here, including writes requested by the Cloudflare agent.

Do not use service-role credentials until the caller and record ownership are verified. Google login and Composio Gmail connection are separate flows. Real data responses and auth responses must not enter the PWA cache.
