# Backend routes

The Next.js backend lives here. This file reserves the boundary without exposing incomplete financial or authentication endpoints.

Suggested route groups: auth callbacks, financial accounts, transactions, dashboard, connection management, provider webhooks, and authenticated agent operations.

Keep route handlers thin: validate requests using @monara/contracts, resolve identity and ownership, then call @monara/core services and @monara/db repositories. Financial writes belong here, including writes requested by the Cloudflare agent.

Do not use service-role credentials until the caller and record ownership are verified. Google login and Composio Gmail connection are separate flows. Real data responses and auth responses must not enter the PWA cache.
