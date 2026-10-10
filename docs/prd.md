# Monara Hackathon PRD

Status: scope locked for MVP  
Date: 10 October 2026  
Platform: mobile-first Next.js PWA

## 1. Product

Monara turns transaction emails into a reviewed personal-finance dashboard, then helps users control budgets and recurring bills.

**Core promise:** connect Gmail once, stop typing expenses manually.

Monara automates data entry, not financial truth. Imported transactions stay pending until the user confirms them.

## 2. Problem

Users lose track of money because:

- transactions are spread across bank, card, and e-wallet emails;
- recording transactions manually is slow and easy to forget;
- budgets are checked too late;
- recurring subscriptions continue unnoticed.

## 3. Target user

An Indonesian mobile user who receives transaction emails from multiple banks, cards, or e-wallets and wants one simple spending view.

## 4. MVP decisions and outputs

| ID | Decision | Product output | Done when |
|---|---|---|---|
| AUTH-01 | Use Supabase Google Sign-In only for Monara login. | Authenticated session and user profile. | User can sign in, refresh, and sign out. |
| GMAIL-01 | Gmail access is a separate Composio OAuth flow. Allow up to 3 Gmail connections. | Connected Gmail card with email, status, last sync, and disconnect action. | Login Gmail and data Gmail may be different accounts. |
| SYNC-01 | Automatically import the last 30 days after connection. Keep a manual **Sync now** recovery action. | Sync state plus imported, skipped, and failed counts. | A completed connection starts its first import without manual transaction entry. |
| EXTRACT-01 | AI extracts normalized fields; unknown values stay empty instead of being guessed. | Pending transaction containing merchant, amount, currency, date/time, description, location, account hint, category suggestion, and confidence. | Every imported item has exact amount, currency, date/time, source reference, and review status. |
| DEDUP-01 | Identify an item by Gmail connection, message ID, and item index. | Duplicate-free transaction list. | Re-running the same import creates no duplicate rows. |
| REVIEW-01 | Every imported transaction starts as `pending`. User may edit, confirm, or reject it. | Trusted confirmed transaction or rejected item. | Only confirmed transactions affect financial totals. |
| DASH-01 | Home shows the selected month's essential information only. | Total spending, remaining budget, spending pace, category breakdown, and recent transactions. | Confirming or editing a transaction updates the dashboard. |
| BUDGET-01 | User creates weekly or monthly category budgets with one warning threshold, default 80%. | Progress bar and in-app warning when the threshold is reached. | Spending is calculated from confirmed transactions; no stored mutable spent value. |
| BILL-01 | AI may suggest a recurring bill, but the user must confirm it. | Upcoming-bills list with merchant, expected amount, cadence, next due date, and status. | A confirmed bill appears in the bill calendar/list. |
| REMINDER-01 | Hackathon reminders are in-app banners/cards. No push, email, or automatic cancellation. | Budget warning and bill-due reminder. | A due or over-threshold item is visible on Home and its detail screen. |
| PWA-01 | Ship as a mobile-first installable PWA that also works on desktop. | Standalone app shell with responsive screens and offline fallback. | It is installable and the shell opens without a network connection. |
| SECURITY-01 | Store normalized product data only. Composio owns Gmail credentials. | No raw email body, Gmail OAuth token, bank PIN, OTP, or secret in the client/database. | RLS isolates every user's records and secret values remain server-side. |

## 5. Primary user flow

1. Sign in to Monara with Google.
2. Connect one or more Gmail accounts through Composio.
3. Monara imports recent finance-related emails.
4. Review pending transactions: edit, confirm, or reject.
5. View confirmed spending on Home.
6. Create a weekly or monthly budget.
7. Confirm detected recurring bills and see due reminders.

## 6. AI extraction contract

Email content is processed transiently. Monara stores only the normalized result.

```json
{
  "source_ref": "gmail-message-id:0",
  "transaction_type": "expense",
  "merchant_name": "Kopi Kenangan",
  "amount": 28000,
  "currency": "IDR",
  "occurred_at": "2026-10-04T13:48:00+07:00",
  "description": "QRIS payment",
  "location": "Jakarta Pusat",
  "account_hint": "Jago",
  "category_suggestion": "Resto & Cafe",
  "confidence": 0.94,
  "review_status": "pending"
}
```

Rules:

- never invent a missing merchant, location, or description;
- preserve the email's exact amount, currency, and transaction time;
- one email may produce multiple items, each with its own item index;
- low confidence remains visible to the user and never auto-confirms;
- rejected transactions never affect totals.

## 7. MVP screens

| Screen | Required output |
|---|---|
| Sign in | Google Sign-In and short privacy explanation. |
| Gmail connections | Connected accounts, status, last sync, add, sync, and disconnect. |
| Review queue | Pending count, transaction fields, edit, confirm, and reject. |
| Home | Monthly summary, budget state, category breakdown, recent transactions, and alerts. |
| Transactions | Search/filter and confirmed/pending/rejected states. |
| Budgets | Weekly/monthly limits, progress, and one warning threshold. |
| Bills | Upcoming recurring bills, cadence, due date, confirm, pause, and archive. |

## 8. Priority

### P0 - demo must work

AUTH-01, GMAIL-01, SYNC-01, EXTRACT-01, DEDUP-01, REVIEW-01, DASH-01, BUDGET-01, BILL-01, REMINDER-01, PWA-01, and SECURITY-01.

### P1 - only after P0 works end to end

- daily scheduled Gmail sync;
- AI budget allocation suggestions;
- PWA push notifications;
- better recurring-bill prediction from longer history.

## 9. Explicit non-goals

- WhatsApp or WeChat bookkeeping agent;
- asset, debt, net-worth, or risk-profile tracking;
- crypto wallets, tokenized assets, or exchange positions;
- direct bank API, PIN, or OTP access;
- automatic subscription cancellation;
- fully automatic approval of imported transactions;
- shared household accounts;
- raw-email archive and generic audit/logging tables.

## 10. Demo acceptance criteria

- A new user reaches a useful dashboard within 3 minutes of connecting Gmail.
- At least 20 curated finance emails import with at least 80% exact core-field accuracy.
- Importing the same emails twice produces zero duplicates.
- Confirm, edit, and reject actions update the correct totals.
- A confirmed transaction can trigger the budget threshold warning.
- A confirmed recurring bill appears with its next due reminder.
- The core flow works at a 390 px mobile viewport and as an installed PWA.
- No raw Gmail body or OAuth credential is stored or exposed to the browser.

## 11. Build order

1. Google login.
2. Gmail connect and first import.
3. Extraction, deduplication, and review queue.
4. Home and transactions.
5. Budgets and threshold warning.
6. Recurring bills and in-app reminder.
7. PWA install/offline verification.

Stop when this loop works end to end.

## 12. References

- Brainstorm PDF supplied for this project.
- [Aiccountant](https://aiccountant.id/en): Gmail import, review-first transaction flow, spending dashboard, categorization, and budgeting patterns.
- [Monara ERD](./erd.md): database entities, ownership, integrity, and security decisions.
