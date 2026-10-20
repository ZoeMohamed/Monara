# Monara security

Monara is a personal-finance PWA. Treat all financial information, email content, chat messages, media, tokens and provider identifiers as sensitive.

## Security model

- The model has no database credentials and may request only registered, validated operations.
- The Next.js backend owns financial writes and verifies identity, operation scope, ownership and confirmation state.
- Supabase tables use forced row-level security, owned references and database constraints as independent enforcement.
- Google sign-in, Composio Gmail authorization and WhatsApp number verification are separate trust boundaries.
- Uncertain Gmail extraction remains pending. Automatic confirmation requires an authenticated sender, complete financial facts, an active owned account and both extraction and classification confidence of at least 0.95.
- Destructive Agent actions require a short-lived, User-bound and single-use backend confirmation.
- The service worker never caches authenticated pages, financial APIs or RSC responses.
- Account deletion blocks access immediately and uses durable retries for provider state and private Goal images.

## Handling credentials and data

Only the public Supabase URL and publishable key belong in `NEXT_PUBLIC_*`. Service-role, model, provider and Agent credentials are server-only. Never commit credentials or place them in fixtures, screenshots, documentation or logs. Never log raw emails, conversations, financial rows, authorization headers or tokens.

Use synthetic identities and transactions for development, demonstrations and security tests. Local configuration does not authorize cloud deployment, remote migration, production mutation or provider messaging.

## Reporting a vulnerability

Do not open a public issue containing exploit details or personal data. Contact the repository owner privately with the affected boundary, minimal reproduction, expected impact and whether any real data was accessed. Remove tokens, raw messages and financial values from the report.

The current assessed posture, evidence and known production blockers are documented in the [security self-assessment](docs/tech/security-self-assessment.md).
