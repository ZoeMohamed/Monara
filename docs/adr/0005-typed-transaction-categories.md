---
status: accepted
---

# Match Categories to Transaction Types

Every Category belongs to exactly one Transaction Type: expense, income, or exclusion. A transaction's Category and Transaction Type must agree. The previous untyped catalog allowed a transaction labelled Internal to remain an expense in financial totals; enforcing compatibility across the UI, backend, and automated classification makes financial treatment explicit rather than dependent on display names.

Preserve existing financial treatment by retaining category identity for its original type and creating typed copies for other existing uses. Repoint category references while retaining labels, transaction types, financial facts, review states, timestamps, budget groupings, and applicable undo references. Use owned Category IDs for automated choices, since identical display names may legitimately exist across types. Category type is immutable after creation.

A pending transaction whose type is unknown may retain an owned Category hint without contributing to totals. New or changed hints require an active Category; unchanged archived references remain available for existing records. Selecting a known Transaction Type enforces exact Category compatibility. This preserves incomplete legacy evidence and undo state without guessing a type.
