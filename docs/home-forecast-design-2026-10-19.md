# Home forecast changes

Status: Accepted and implemented locally. Production deployment and the live midnight schedule have not been verified.

## Agreed behavior

- Remove the text on the right of the live Spending forecast card header, including "Expected, not confirmed".
- On desktop, group Forecasts and flags and then Needs attention in the left column below Spending forecast; Safe to spend today stays on the right. On mobile, order the cards Spending forecast, Safe to spend today, Forecasts and flags when available, Needs attention, then Latest activity.
- Generate specific Expected Payments automatically each day at midnight and retain a manual forecast button.
- Below the manual button, show exactly: "Forecast will update every night at 00.00".
- Automatically generate a first forecast when none exists.
- Show a Spending Projection independently of whether specific Expected Payments have been generated.
- Base the initial projection on average daily confirmed expenses over the previous 30 complete days, including zero-spend days. Recompute when confirmed transactions change.
- Refine the projection when specific Expected Payments become available. Replace the corresponding baseline contribution before adding those payments, so the same spending is not counted twice.
- Keep predictions separate from confirmed totals and Budget usage.
- Midnight means 00.00 Asia/Jakarta. When Home opens after a missed nightly run, refresh the stale forecast automatically.
- Do not hide the graph behind a minimum-history threshold. Use available recorded history, including zero-spend days within that span, and label estimates based on fewer than 30 complete days as limited history.
- Remove only historical expenses supporting a predicted payment's pattern from the baseline; retain unrelated spending at the same merchant.
- The graph and the card's month-end total use the same combined projection.
- If today is the only recorded day, use today's spending as a provisional daily pace and label it as limited history.
- With no confirmed expenses, still show the chart with "Add expenses to build your projection", plus any available specific Expected Payments.

## Previous behavior

The previous Worker schedule was weekly, Monday at 02:00 UTC. Its backend refresh endpoint processed at most 25 eligible Users per invocation, and current-month forecasts became due after six days. A nightly schedule must also update eligibility and batching so this cap does not silently leave Users stale. Source configuration is not evidence that a live schedule is deployed.

The previous graph added upcoming unrealized Expected Payments to current-month confirmed spending. It had no historical baseline and was hidden until a saved forecast existed. The Home session already loads paginated ledger history. The graph and the card's month-end total must use the same combined projection after the change.

Current forecast rules use 130 days of confirmed expense history for recurring payments. The 30-day window is for the projection baseline; it does not replace that pattern-detection history.

## Implementation details

- The baseline divides recorded confirmed IDR expenses by the available complete calendar-day span, capped at 30 days. Today's expenses are excluded from that average unless today is the only recorded day. Historical coverage is inferred from the earliest recorded expense, not guaranteed bank completeness.
- Baseline spending begins tomorrow because today's confirmed expenses are already counted. Expected Payments due today still contribute when unrealized.
- Replacing historical pattern contributions requires the same normalized merchant, an amount within the predicted historical range, and a matching weekday for habits or a day within two days of the monthly bill date. At most one expense per matching occurrence is removed; incidental expenses remain.
- Home graph and card totals combine the residual baseline and upcoming Expected Payments. Backend forecast summaries and the History forecast list continue to describe specific payments only.
- The Worker runs at 17:00 UTC each day, midnight Asia/Jakarta. The backend checks freshness against Jakarta midnight, processes 25 active Users per request and returns a validated UUID cursor. The Worker continues through batches within a 12-minute deadline and reports failures or unfinished batches. Home provides catch-up after missed runs. This remains a best-effort refresh, not a guarantee of completion at exactly midnight.
- Historical weekly source labels remain readable. A new migration permits the daily source label.

## Local verification

- `pnpm check`: passed, including React Doctor scores of 100 with no findings.
- `pnpm build`: Next.js production build and Worker dry-run bundle passed.
- Local migration application, schema lint, generated database types and all 393 database assertions passed. Generated types did not change.
- T3 collaborative browser at 390 by 844: confirmed card order, absent right-hand header text, empty-history chart, first-day estimate, matching graph/card total, manual refresh and exact nightly helper text. A synthetic stale forecast refreshed with the daily source on Home load.
- The scheduled backend endpoint returned HTTP 200 locally. Worker continuation beyond 25 Users is covered with synthetic batch-response tests. No production deployment or natural midnight invocation was performed.
