# Supabase clients

`@monara/db` owns the low-level Supabase client setup. It never reads ambient environment variables and never creates a service-role client on import.

- Parse the public URL and publishable key with `parsePublicSupabaseConfig`.
- ZO5 can use `createMonaraBrowserClient` in browser-only Auth code.
- ZO5 can use `createMonaraServerClient` with request-scoped `getAll`/`setAll` cookie methods in Next.js Route Handlers and Server Actions.
- Use `checkSupabaseConnectivity` for a non-cached connectivity check. It calls the Auth settings gateway with the publishable key, so both the project URL and key are exercised, and never uses the service-role key.

The web app exposes `GET /api/health/supabase`. It returns only connection state, never configuration values or upstream error details. Start the local stack with `pnpm db:start`; that command writes the local public values to the ignored `apps/web/.env.local` file.

## Cloud setup still owned by a human administrator

Copy the public project URL and publishable key into the ignored `apps/web/.env.local` file or the deployment environment. Keep the service-role key server-only. Supabase organization invitations are sent from the Dashboard's team settings; never put an access token or invitation link in this repository. After configuration, request `/api/health/supabase` and expect HTTP 200 with `{ "connected": true }`.
