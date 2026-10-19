# Monara

Monara helps people track their personal finances across financial accounts and connected communication channels.

## Language

**User**:
A person with a Monara identity who owns their personal financial records.
_Avoid_: Account when referring to a person's identity

**Financial Account**:
A bank account, wallet, or cash balance whose transactions and balance a User tracks in Monara.
_Avoid_: User account, login account

**User Deletion**:
The permanent removal of a User's Monara identity and all their personal Monara data, including Financial Accounts, transactions, settings, connections, and conversations. It has no recovery grace period or undo.
_Avoid_: Financial Account deletion when referring to deleting the entire identity

**Pending Transaction**:
A transaction extracted from a source that awaits review and does not contribute to confirmed dashboard totals.
_Avoid_: Confirmed transaction when review is outstanding

**Confirmed Transaction**:
A reviewed transaction included in the User's financial totals. A Gmail import is confirmed without review only when its sender is authenticated and the extraction is confident and complete.
_Avoid_: Pending transaction

**Gmail Connection**:
A User-authorized connection to a Gmail mailbox for importing transaction emails, separate from signing into Monara.
_Avoid_: Google login when referring to mailbox authorization

**WhatsApp Link**:
A verified association between a User and their WhatsApp number that permits conversations to access that User's records.
_Avoid_: Phone number as proof of identity

### Spending

**Category**:
A label a User assigns to transactions to group them by kind of spending.
_Avoid_: Tag, type

**Budget**:
A spending limit a User sets for a Category over a weekly or monthly period, measured against Confirmed Transactions.
_Avoid_: Allowance, quota

**Recurring Bill**:
A payment that repeats on a regular cadence, such as a subscription or a utility, detected from the User's history and confirmed by the User.
_Avoid_: Subscription when the payment is not one

**Review Queue**:
The Pending Transactions a User confirms, edits, or excludes, shown in the transaction list as the "To review" filter with its own count, rather than on a separate screen.
_Avoid_: Inbox

**Expense**:
A transaction for money going out, which counts toward spending and Budgets.
_Avoid_: Debit, payment

**Income**:
A transaction for money received by a User, such as salary, which counts toward income only.
_Avoid_: Credit, deposit

**Excluded Transaction**:
A confirmed transaction whose type is `exclusion`, intentionally kept out of financial totals, such as an internal transfer, reimbursement, duplicate, or non-personal transaction.
_Avoid_: Deleting an imported record when it must remain for deduplication

### Agent

**Agent**:
The AI assistant that understands a User's requests and acts on their records through Agent Tools.
_Avoid_: Bot, chatbot

**Channel**:
A way a User talks to the Agent, either the in-app chat or a WhatsApp Link.
_Avoid_: Platform, integration

**Agent Tool**:
One action the Agent can take on a User's behalf, such as listing, adding, or deleting a transaction.
_Avoid_: Function, command

**Permission Tier**:
The risk level of an Agent Tool, which decides whether it runs freely, runs with undo, needs the User's explicit confirmation, or is never available in chat.
_Avoid_: Role, access level

**Reminder**:
A proactive message telling a User that a Budget threshold was reached or a Recurring Bill is due, shown in the app and sent to their WhatsApp Link.
_Avoid_: Notification, alert

**Sandbox**:
A seeded environment with synthetic data used to demonstrate and evaluate the Agent.
_Avoid_: Test environment, demo account
