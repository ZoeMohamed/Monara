# Shared operation contracts

These Zod schemas are the browser-safe boundary shared by the web backend, UI, and Agent. Parse every external request and provider-derived value before it reaches business logic.

## Decisions

- Caller inputs never contain a `userId`. The server resolves the authenticated User and verifies resource ownership.
- Resource IDs are UUIDs.
- Financial Accounts are `bank`, `wallet`, or `cash`; the contracts do not expose stored balances or account deletion. Set `isActive` to `false` to stop using an Account while historical records keep their reference. Default Categories may be renamed, re-iconed, recolored, or archived without replacing their UUIDs.
- Money crosses JSON as `{ amountMinor: string, currency: "IDR" }`. A string preserves exact values beyond JavaScript's safe-integer range; because IDR has no fractional minor units, the backend maps it to constrained Postgres `numeric` without rounding.
- Imported transactions may keep uncertain values as `null`. Review status is only `pending` or `confirmed`; type is `expense`, `income`, or `exclusion`. Confirming requires a type, positive amount, and calendar date. Every transaction has at most one Financial Account/payment method; direct creates require it, while imported records may leave it unassigned for User review. Internal transfers, reimbursements, duplicates, and non-personal records use the confirmed `exclusion` type and do not affect totals. For confirmed updates, the backend merges the accepted patch with the persisted row and parses the result with `confirmedTransactionValuesSchema` before saving.
- Callers never choose transaction provenance. The authenticated backend derives `manual_form`, `gmail_email`, `in_app_chat`, `whatsapp_text`, `whatsapp_receipt`, or `whatsapp_voice` from the verified route and provider context. Direct creates require the Financial Account and a merchant/source or description.
- Create operations carry a `clientRequestId` for backend idempotency. T1 mutations return a reversible action receipt that can be passed to `undoActionInputSchema`.
- All update, confirm, exclude, dismiss, and delete inputs carry the last observed state (`expectedUpdatedAt` or `expectedStatus`) so the backend can reject stale writes.
- Recurring-bill detection returns a proposal. `confirmRecurringBillInputSchema` creates the active Bill only after explicit User confirmation. Cancellation links must use HTTPS; Monara provides guidance only.
- Reminder records are user-facing budget-threshold or bill-due events. The public contract includes WhatsApp opt-in and coarse delivery state, never provider payloads or raw conversations.

The schemas do not authorize a request. Authentication, ownership checks, RLS, idempotency enforcement, source derivation, and state-transition rules remain backend responsibilities.
