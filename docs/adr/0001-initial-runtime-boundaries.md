# Initial runtime boundaries

Monara starts from an existing Next.js PWA prototype using sample data and browser state. The initial working scope is authentication, transaction tracking, dashboard, Gmail ingestion, and the WhatsApp agent; other product features remain placeholders.

Keep the app backend in Next.js API routes on Vercel and put reusable business logic in shared workspace packages. Deploy the LLM agent separately on Cloudflare. This gives the team clear runtime boundaries without introducing a separately deployed app API at this stage.

Use TypeScript for production agent code, with a separate playground for experiments. Borrow Aiccountant's deployable-app and shared-library boundaries, then selectively adapt useful implementations rather than copying large modules and removing unwanted functionality afterward. Keep the existing Next.js frontend and use HeroUI for its component foundation.

Use Supabase Auth with Google sign-in. Connecting Gmail through Composio is a separate operation from signing into Monara.

Adlyn owns Gmail connectivity and transaction extraction. Argya owns conversational finance logic and budgeting experiments. Farrel owns Kapso WhatsApp transport and connects it to the shared agent runtime.

The Next.js backend owns financial writes and their validation and ownership checks. The Cloudflare agent calls defined backend operations rather than writing financial data directly to Supabase. Keep PWA installation and offline app-shell behavior, but require connectivity for real data operations initially.

Use apps/web and apps/agent as the deployment boundaries, packages/core, contracts, db, integrations, and ui for shared code, supabase for database configuration and migrations, and playground/llm for isolated experiments. Organize folders by responsibility and document team ownership separately.

Process connected Gmail automatically through durable background jobs in the Cloudflare runtime, with manual sync for testing and recovery. Save extracted transactions as pending review before including them in dashboard totals. Make email processing idempotent. Link WhatsApp numbers explicitly through the signed-in User and verify ownership before accepting financial operations.

The approved implementation in this task is scaffolding: workspace packages, entry points, starter shared contracts, empty environment templates, and ownership/run instructions. Feature owners implement authentication, financial persistence, Gmail, WhatsApp, durable jobs, and the actual agent afterward. The worker initially exposes only a scaffold health response and rejects unimplemented operations.
