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
A transaction accepted as final, with its Transaction Type determining whether it contributes to expense, income, or neither. A valid Gmail import may be confirmed automatically when its Review Confidence meets the confirmation threshold.
_Avoid_: Pending transaction

**Gmail Connection**:
A User-authorized connection to a Gmail mailbox for importing transaction emails, separate from signing into Monara.
_Avoid_: Google login when referring to mailbox authorization

**WhatsApp Link**:
A verified association between a User and their WhatsApp number that permits conversations to access that User's records.
_Avoid_: Phone number as proof of identity

### Transactions

**Transaction Type**:
The financial treatment of a transaction: expense, income, or exclusion.
_Avoid_: Category when referring to whether money counts as spending, income, or neither

**Category**:
A label that groups transactions within exactly one Transaction Type: expense, income, or exclusion. A transaction's Category must match its Transaction Type when that type is known; a Pending Transaction may retain a category hint while its type is unknown.
_Avoid_: Tag, Transaction Type

**Budget**:
A spending limit a User sets for an expense Category over a weekly or monthly period, measured against Confirmed expenses.
_Avoid_: Allowance, quota

**Recurring Bill**:
A payment that repeats on a regular cadence, such as a subscription or a utility, detected from the User's history and confirmed by the User.
_Avoid_: Subscription when the payment is not one

**Review Queue**:
The Pending Transactions a User confirms, edits, or excludes, shown in the transaction list as the "To review" filter with its own count, rather than on a separate screen.
_Avoid_: Inbox

**Extraction Confidence**:
The confidence in the transaction facts extracted from its source, such as the amount, date, and counterparty.
_Avoid_: Category confidence when referring to extracted transaction facts

**Categorization Confidence**:
The confidence in the Category assigned to a transaction. It is separate from confidence in the underlying transaction facts.
_Avoid_: Extraction confidence when referring to the chosen Category

**Review Confidence**:
The lower of the available Extraction Confidence and Categorization Confidence scores. When only one is known, that score is the Review Confidence; it is not a third independent assessment.
_Avoid_: Used, third confidence score

**Fallback Category**:
A Category assigned when a more specific Category cannot be determined. Assignment of a Fallback Category does not itself establish confidence in the transaction or its classification.
_Avoid_: No category when a fallback has been assigned

**Person Category**:
A Category for a transaction shown under another person's name, including when its purpose is known. Expense and income have separate Person Categories; a matching account-holder name belongs to Internal.
_Avoid_: Family or Giving as a general label for every personal name

**Normalized Display Name**:
A readable transaction name with clean capitalization and spacing, recognizable business names standardized, and secondary details shortened when needed. A brand precedes its legal company name, and meaningful branch details are retained. The original source name remains separate evidence; personal-name formatting is cleaned without guessing spelling or identity.
_Avoid_: Original counterparty name when referring to the cleaned display label

**Expense**:
A transaction for money going out, which counts toward spending and Budgets.
_Avoid_: Debit, payment

**Income**:
A transaction for money received by a User, such as salary, which counts toward income only.
_Avoid_: Credit, deposit

**Excluded Transaction**:
A confirmed transaction whose type is `exclusion`, intentionally kept out of financial totals, such as an internal transfer, reimbursement, duplicate, or non-personal transaction.
_Avoid_: Deleting an imported record when it must remain for deduplication

**Internal Transfer**:
Money moving between bank accounts, wallets, or cash balances owned by the same User, whether or not both are tracked in Monara. Its Category is Internal and its Transaction Type is exclusion.
_Avoid_: Income or expense when referring to movement of the User's own funds

### Forecasting

**Spending Projection**:
An estimate of spending through the end of the month, based on recent Confirmed expenses and refined by specific Expected Payments when available. It is separate from confirmed spending and Budget usage.
_Avoid_: Confirmed spending when referring to a future estimate

**Expected Payment**:
A specific future expense predicted from a User's recorded spending patterns. It is a prediction, not a Pending Transaction or a Confirmed Transaction.
_Avoid_: Pending Transaction when referring to a predicted payment

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
