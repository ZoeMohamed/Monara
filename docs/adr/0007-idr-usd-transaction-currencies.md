---
status: accepted
---

# Support IDR and USD without currency activation

Keep IDR as Monara's Primary Currency and support IDR and USD transactions without a profile currency-activation step, including during Gmail onboarding. Restricting the supported set keeps the release small. Treat a bare `$` as USD by deliberate product convention, while `Rp` and `IDR` mean IDR. Explicit unsupported currencies must not be silently relabelled as either supported currency.

When currency is absent, default to IDR and keep the transaction pending review. When a bank notification states both an original USD purchase price and an actual IDR debit, use the stated IDR debit as the recorded amount and preserve the original price as evidence, without creating a second expense. Apply the new behavior to new imports only; recovery of previously processed or skipped foreign amounts is outside this release.

For a USD-only transaction, preserve the USD amount and save a separate estimated IDR Equivalent for financial totals, Budgets, reports, forecasts, and chat. Use Frankfurter's ECB reference rates for the transaction's recorded day, selecting the latest published rate on or before that day. Save the rate, source, actual rate day, and result so retries and later market movements cannot revalue existing transactions. Calculate outside the LLM with exact decimal or scaled-integer arithmetic and round once to the nearest whole rupiah, with halves rounded up.

Use cached reference rates first and bound the entire FX lookup to two seconds, with no inline retries. Do not substitute a fixed fallback rate. If conversion is unavailable, save the original USD transaction as pending with no IDR Equivalent, show it during onboarding and in the ledger, and exclude it from confirmed IDR totals. Import progress still completes. Bounded background retries may supply the first valid conversion and then apply the normal confirmation requirements.

Editing the USD amount or transaction date calculates a new conversion; unrelated edits and unchanged confirmation preserve the saved conversion. Undo restores the previous transaction values and FX Snapshot together. A late lookup or retry must not overwrite a newer edit or revalue a completed conversion. See [the accepted design](../multi-currency-design.md) for the complete behavior and implementation acceptance boundaries.
