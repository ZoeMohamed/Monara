# Backend routes

The Next.js backend lives here. Financial writes belong to these routes, including writes requested by the Cloudflare Agent. Implemented routes do not establish deployed configuration or completed screen adapters.

| Route | Implemented boundary |
| --- | --- |
| `POST /api/finance/operations/[operation]` | Verifies the Google session, validates the operation input, and calls owned financial account, category, transaction/review, budget, and dashboard services. |
| `POST /api/agent/operations/[operation]` | Requires the server-only Agent/backend credential, validates the trusted runtime caller and input, and rechecks resource ownership in the financial service. Transaction/budget deletion requires a bound destructive confirmation. |
| `/api/gmail/connections`, `/api/gmail/connections/[connectionId]`, `/api/gmail/connections/callback` | Owned Gmail list, separate consent, callback verification, and disconnect lifecycle. |
| `GET /api/health/supabase` | Reports configuration/connectivity availability without returning credentials. |

Google Auth start, callback, and sign-out handlers live under `src/app/auth`. The in-app Chat bridge, WhatsApp resolve-sender/linking routes, automatic Gmail ingestion/sync, Reminder operations, recurring-bill operations, and persisted Undo execution remain incomplete. Do not infer supported Agent operations from the worker's tool catalog: the backend allowlist is authoritative.

Keep route handlers thin: validate requests using @monara/contracts, resolve identity and ownership, then call @monara/core services and @monara/db repositories. Financial writes belong here, including writes requested by the Cloudflare agent.

Do not use service-role credentials until the caller and record ownership are verified. Google login and Composio Gmail connection are separate flows. Real data responses and auth responses must not enter the PWA cache.
