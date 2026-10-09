# Security notes

The UI currently uses demo data. Backend, database, and agent packages are scaffolds; no live financial or provider integration is connected.

- Keep secrets out of browser bundles and `NEXT_PUBLIC_*`. Only public Supabase URLs and publishable keys belong in public environment variables.
- The service worker caches only the app shell and same-origin assets. Do not cache auth responses or financial data.
- Implement financial writes in the Next.js backend with authenticated identity, resource ownership checks, and Supabase RLS. A shared agent/backend secret alone does not establish User authorization.
- Google sign-in and Composio Gmail authorization are separate flows. Request only the Gmail permissions needed for read-only ingestion.
- Verify provider webhook signatures and the User's WhatsApp link before accepting channel operations.
- Never log raw emails, conversations, financial records, tokens, or credentials. Use synthetic fixtures for local development.
- Incomplete handlers fail explicitly. The worker health response reports scaffold status, not production readiness.
