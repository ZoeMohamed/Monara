# Monara Hackathon PRD

| ID | Decision | Required product output |
|---:|---|---|
| 001 | Monara is a mobile-first Next.js PWA that also works on desktop. | Installable standalone app with responsive mobile screens and an offline fallback. |
| 002 | Use Supabase Google Sign-In for Monara authentication. | User can sign in, keep their session after refresh, and sign out. |
| 003 | Gmail access uses a separate Composio OAuth flow. Login Gmail and transaction Gmail may be different accounts. | Connected Gmail account showing email address, connection status, and last sync time. |
| 004 | One user may connect up to three Gmail accounts. | Add, sync, and disconnect controls for each Gmail account. |
| 005 | Connecting Gmail automatically imports finance-related emails from the last 30 days. Manual **Sync now** is available as a recovery action. | Sync result showing imported, skipped, and failed item counts. |
| 006 | AI extracts normalized transaction data and leaves unknown values empty instead of guessing. | Merchant, amount, currency, date and time, description, location, account hint, suggested category, and confidence score. |
| 007 | Every imported transaction starts as `pending`. | Review queue where the user can edit, confirm, or reject each transaction. |
| 008 | The same Gmail message item must never create more than one transaction. | Re-running an import produces zero duplicate transactions. |
| 009 | Only `confirmed` transactions affect financial calculations. | Correct dashboard totals, category totals, budget usage, and recurring-bill matching. |
| 010 | Home shows only the selected month's essential financial information. | Total spending, remaining budget, spending pace, category breakdown, recent transactions, and active alerts. |
| 011 | Users create weekly or monthly category budgets with one warning threshold, defaulting to 80%. | Budget limit, used amount, remaining amount, progress, and an in-app threshold warning. |
| 012 | AI may suggest recurring bills, but users must confirm them. | Bills list showing merchant, expected amount, cadence, next due date, and status. |
| 013 | Budget and bill alerts appear only when the user opens Monara. No phone push, email, or WhatsApp notification. | Alert cards for exceeded budgets and upcoming bills on Home. |
| 014 | Composio owns Gmail credentials. Monara stores only normalized product data. | No raw email body, Gmail OAuth token, bank PIN, OTP, or server secret stored in the browser or product tables. |
| 015 | Every user's data is private. | Supabase RLS isolates all user-owned records and server secrets remain server-side. |
