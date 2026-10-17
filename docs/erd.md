# Monara MVP ERD

Status: implementation contract for the hackathon schema. This document defines the shape for ZO4 migrations; it does not provision or migrate a remote Supabase project.

## Runtime and identity boundaries

- `auth.users.id` is the Monara User identity. Google sign-in through Supabase Auth and Gmail authorization through Composio are separate consent flows.
- Every product row is owned by one User. Caller-supplied `user_id` is never accepted as authorization; the backend resolves identity and checks ownership.
- All product IDs are UUIDs. Every multirow owned table whose primary key is `id` also has `unique (id, user_id)` so composite foreign keys enforce same-User relationships. The one-to-one Profile row uses `id`, equal to `auth.users.id`; Reminder Preferences uses `user_id` as its primary key. Short-lived Agent Action State uses `action_id` and references `(agent_action_logs.id, user_id)`.
- The Next.js backend owns financial writes. Agent and provider adapters call authenticated backend operations instead of writing financial rows directly.
- Composio stores Gmail credentials. Monara does not store OAuth tokens or raw email bodies.
- A WhatsApp number becomes an identity signal only after the signed-in User explicitly verifies a WhatsApp Link.

## Entity relationship diagram

```mermaid
erDiagram
    AUTH_USERS ||--|| PROFILES : has
    AUTH_USERS ||--o{ FINANCIAL_ACCOUNTS : owns
    AUTH_USERS ||--o{ CATEGORIES : owns
    AUTH_USERS ||--o{ GMAIL_CONNECTIONS : authorizes
    AUTH_USERS ||--o{ PROCESSED_GMAIL_MESSAGES : processes
    AUTH_USERS ||--o{ TRANSACTIONS : owns
    AUTH_USERS ||--o{ BUDGETS : sets
    AUTH_USERS ||--o{ RECURRING_BILLS : tracks
    AUTH_USERS ||--o{ REMINDERS : receives
    AUTH_USERS ||--|| REMINDER_PREFERENCES : configures
    AUTH_USERS ||--o{ REMINDER_DELIVERIES : owns
    AUTH_USERS ||--o| WHATSAPP_LINKS : verifies
    AUTH_USERS ||--o{ AGENT_ACTION_LOGS : audits
    AUTH_USERS ||--o{ AGENT_ACTION_STATES : owns

    GMAIL_CONNECTIONS ||--o{ PROCESSED_GMAIL_MESSAGES : contains
    PROCESSED_GMAIL_MESSAGES o|--o{ TRANSACTIONS : yields
    FINANCIAL_ACCOUNTS o|--o{ TRANSACTIONS : records
    FINANCIAL_ACCOUNTS o|--o{ TRANSACTIONS : transfer_from
    FINANCIAL_ACCOUNTS o|--o{ TRANSACTIONS : transfer_to
    CATEGORIES o|--o{ TRANSACTIONS : classifies
    CATEGORIES ||--o{ BUDGETS : limits
    FINANCIAL_ACCOUNTS o|--o{ RECURRING_BILLS : charges
    RECURRING_BILLS o|--o{ TRANSACTIONS : matches
    BUDGETS o|--o{ REMINDERS : triggers
    RECURRING_BILLS o|--o{ REMINDERS : triggers
    REMINDERS ||--o{ REMINDER_DELIVERIES : dispatches
    AGENT_ACTION_LOGS ||--o| AGENT_ACTION_STATES : holds_ephemeral_state

    AUTH_USERS {
        uuid id PK
    }

    PROFILES {
        uuid id PK_FK
        text display_name
        text timezone
        text currency
        timestamptz created_at
        timestamptz updated_at
    }

    FINANCIAL_ACCOUNTS {
        uuid id PK
        uuid user_id FK
        text client_request_id
        text name
        text institution
        text account_type
        text currency
        text last_four
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    CATEGORIES {
        uuid id PK
        uuid user_id FK
        text name
        text slug
        text icon
        text color
        boolean is_default
        boolean is_archived
        timestamptz created_at
        timestamptz updated_at
    }

    GMAIL_CONNECTIONS {
        uuid id PK
        uuid user_id FK
        text composio_connected_account_id
        text gmail_address
        text status
        timestamptz last_synced_at
        timestamptz created_at
        timestamptz updated_at
    }

    PROCESSED_GMAIL_MESSAGES {
        uuid id PK
        uuid user_id FK
        uuid gmail_connection_id FK
        text gmail_message_id
        text processing_status
        timestamptz received_at
        timestamptz processed_at
        timestamptz created_at
        timestamptz updated_at
    }

    TRANSACTIONS {
        uuid id PK
        uuid user_id FK
        uuid processed_gmail_message_id FK
        int source_item_index
        text client_request_id
        uuid financial_account_id FK
        uuid from_financial_account_id FK
        uuid to_financial_account_id FK
        uuid category_id FK
        uuid recurring_bill_id FK
        text source_type
        text transaction_type
        text merchant_name
        numeric amount
        text currency
        date occurred_on
        time occurred_time
        text description
        text location
        text account_hint
        numeric ai_confidence
        text review_status
        timestamptz deleted_at
        timestamptz created_at
        timestamptz updated_at
    }

    BUDGETS {
        uuid id PK
        uuid user_id FK
        uuid category_id FK
        text client_request_id
        text name
        text cadence
        numeric limit_amount
        text currency
        smallint warning_percent
        date starts_on
        boolean is_active
        timestamptz deleted_at
        timestamptz created_at
        timestamptz updated_at
    }

    RECURRING_BILLS {
        uuid id PK
        uuid user_id FK
        uuid financial_account_id FK
        text client_request_id
        text merchant_name
        numeric expected_amount
        text currency
        smallint interval_count
        text interval_unit
        date next_due_on
        text status
        text cancellation_url
        numeric ai_confidence
        timestamptz deleted_at
        timestamptz created_at
        timestamptz updated_at
    }

    REMINDER_PREFERENCES {
        uuid user_id PK_FK
        boolean whatsapp_enabled
        timestamptz created_at
        timestamptz updated_at
    }

    REMINDER_DELIVERIES {
        uuid id PK
        uuid user_id FK
        uuid reminder_id FK
        text channel
        text status
        text template_name
        text provider_message_id
        text failure_code
        timestamptz attempted_at
        timestamptz sent_at
        timestamptz created_at
        timestamptz updated_at
    }

    REMINDERS {
        uuid id PK
        uuid user_id FK
        uuid budget_id FK
        uuid recurring_bill_id FK
        text kind
        text status
        text dedupe_key
        smallint threshold_percent
        smallint offset_days
        text title
        text message
        timestamptz scheduled_for
        timestamptz read_at
        timestamptz created_at
        timestamptz updated_at
    }

    WHATSAPP_LINKS {
        uuid id PK
        uuid user_id FK
        text phone_e164_hmac
        text phone_last_four
        text kapso_contact_id
        text status
        text verification_code_digest
        timestamptz verification_expires_at
        smallint verification_attempts
        timestamptz verified_at
        timestamptz last_inbound_at
        timestamptz created_at
        timestamptz updated_at
    }

    AGENT_ACTION_LOGS {
        uuid id PK
        uuid user_id FK
        text channel
        text event_type
        text tool_name
        text permission_tier
        text result_status
        text resource_type
        uuid resource_id
        text request_fingerprint
        timestamptz confirmation_expires_at
        timestamptz undo_expires_at
        uuid reversed_action_id FK
        timestamptz created_at
    }

    AGENT_ACTION_STATES {
        uuid action_id PK_FK
        uuid user_id FK
        text purpose
        jsonb operation_state
        timestamptz expires_at
        timestamptz consumed_at
        timestamptz created_at
    }
```

## Table rules

### Profiles and Financial Accounts

- `profiles.id` equals `auth.users.id`. Default timezone is `Asia/Jakarta`; MVP currency is `IDR`.
- `profiles.full_name` is nullable (1 to 150 characters once set). Onboarding asks for it; `display_name` stays what Google sent. Categorization compares it with a payment's recipient to recognise transfers between the User's own accounts. Only the backend writes it, since signed-in browsers have select-only access to `profiles`.
- Financial Account types are exactly `bank`, `wallet`, or `cash` for the MVP.
- Financial Accounts do not store balances. Dashboard account figures are calculated from confirmed income and expense rows; transfers are excluded from spending and income totals.
- Financial Account creates carry a `client_request_id` that is unique per User. Account deletion is outside the MVP and is not exposed to the Agent. Setting `is_active = false` stops new writes from selecting the Account while historical transactions keep their reference.
- Seed 15 default Category rows per User. `(user_id, slug)` is unique. Category names are editable presentation data; transactions and budgets reference Category UUIDs.

### Gmail ingestion and deduplication

- A User may have at most three active Gmail Connections; the backend enforces the count transactionally.
- Gmail Connection status is exactly `active`, `disconnected`, or `error`. Processed-message status is exactly `processing`, `processed`, `skipped`, or `failed`.
- `gmail_connections.composio_connected_account_id` is globally unique. `(user_id, gmail_address)` is unique.
- `processed_gmail_messages` stores source identity and processing state only: no sender, subject, raw body, body hash, attachment, OAuth token, or extracted financial payload.
- `(gmail_connection_id, gmail_message_id)` is unique. Keep this row after a transaction is rejected so re-import cannot recreate it.
- One Gmail message may contain multiple transactions. `transactions (processed_gmail_message_id, source_item_index)` is unique when the source message exists.
- A Gmail transaction requires both `processed_gmail_message_id` and `source_item_index`. A non-Gmail transaction requires both columns to be null.

### Transactions and Review Queue

- `source_type` is `manual_form`, `gmail_email`, `in_app_chat`, `whatsapp_text`, `whatsapp_receipt`, or `whatsapp_voice`. The backend derives this value from its authenticated route and verified provider context; callers cannot choose it.
- `review_status` is `pending`, `confirmed`, or `rejected`. Provider extraction always creates `pending` rows.
- Pending rows may keep `transaction_type`, `merchant_name`, `amount`, `currency`, `occurred_on`, `occurred_time`, account references, Category, description, location, account hint, and confidence as `null`. Missing values are never invented.
- A confirmed row requires `transaction_type`, positive `amount`, `currency = 'IDR'`, and `occurred_on`. Time, merchant/source, Category, description, location, and the single Financial Account may remain unknown.
- `transaction_type` is `expense`, `income`, or `transfer`. Confirmed transfers require different `from_financial_account_id` and `to_financial_account_id`; `financial_account_id` must be null. Non-transfers must have both transfer account columns null.
- Only confirmed income and expense rows affect dashboard, category, budget, savings-rate, and recurring-bill calculations. Transfers are excluded from income and spending totals.
- `ai_confidence` is nullable and constrained from `0` through `1`.
- `client_request_id` is required for direct User and Agent creates and null for Gmail imports. `(user_id, client_request_id)` is unique when present, so retrying an ambiguous request cannot create another transaction. Provider adapters derive stable request IDs from verified provider message identity and item index.
- Direct User and Agent creates require a Financial Account plus a merchant/source or description. Provider imports may leave those fields null while pending; missing data is never invented.
- JSON operations use the shared `{ amountMinor: string, currency: "IDR" }` representation. IDR has zero minor-unit decimals, so `amountMinor` maps to exact Postgres `numeric` with constraints requiring a positive integer below `10^20`; fractional Rupiah values are rejected rather than rounded.
- Reject and confirm are valid only from `pending`. Backend operations use the last observed `updated_at` to reject stale writes.
- `delete_transaction` is a T2 operation and sets `deleted_at`. Every T2 request first creates an expiring confirmation bound to its exact action and resource IDs; only the literal answer `yes` executes it. Soft-deleted rows are excluded from normal lists and every financial calculation.

### Budgets and recurring bills

- A Budget belongs to one Category and has `weekly` or `monthly` cadence. `warning_percent` defaults to `80` and is constrained from `1` through `100`.
- Budget and confirmed Recurring Bill creates carry a `client_request_id`; each is unique per User so retries cannot duplicate a T1 action.
- Budget usage is computed from confirmed expense transactions in the period; never persist a mutable `spent_amount` total.
- A recurring-bill detector returns a proposal but does not create a product row. Explicit User confirmation creates an `active` Recurring Bill. A previously active Bill may become `dismissed`; rejecting a proposal creates no Bill.
- `cancellation_url` is optional and HTTPS-only. Monara shows cancellation guidance but never cancels a subscription for the User.
- `delete_budget` and `delete_bill` are T2 operations and set `deleted_at`. Soft-deleted rows never contribute to usage, forecasts, upcoming bills, or Reminders.

### Reminders

- A Reminder is either `budget_threshold` or `bill_due` and references exactly one matching source: `budget_id` or `recurring_bill_id`.
- `(user_id, dedupe_key)` is unique. Suggested keys are `budget:<budget_id>:<period>:<threshold>` and `bill:<bill_id>:<due_date>:<offset_days>`.
- `status` is `unread`, `read`, or `dismissed`. Reminder rows are user-facing product state, not an operational provider log.
- Threshold history, rearming, quiet hours, daily caps, in-app creation, and WhatsApp template delivery are owned by the Reminders engine. The database uniqueness constraint is the final duplicate guard.
- `reminder_preferences` stores only whether verified WhatsApp delivery is enabled. In-app Reminders are always enabled; policy values such as 22:00–07:00 quiet hours and the daily limit of three WhatsApp sends are application configuration, not caller-controlled preferences.
- A `reminder_deliveries` row records only coarse WhatsApp delivery state: `queued`, `sent`, `skipped`, or `failed`. It may store the approved template name, provider message ID, and a non-sensitive failure code, but never message content or provider payloads. Multiple rows may share one provider message ID when extra Reminders are combined into a summary.
- The Reminders engine uses `scheduled_for`, the User timezone, delivery rows, and `whatsapp_links.last_inbound_at` to enforce quiet hours, the daily cap, and the Meta 24-hour/template rule.

### WhatsApp Link

- A User has at most one current WhatsApp Link, and one verified number belongs to at most one User.
- Store a server-generated HMAC of the E.164 number plus the last four digits for display. Never store a plain number or an unsalted phone hash.
- Store only a one-way verification-code digest. Codes expire, attempts are limited, and challenge fields are cleared after verification.
- `status` is `pending`, `verified`, or `revoked`. Incoming messages resolve a User only through a verified link; a caller-supplied phone number or User ID is not proof of identity.

### Agent action log

- Every attempted Agent tool call creates one `agent_action_logs` row with `event_type = 'tool_call'`, the verified User, Channel, tool name, permission tier, coarse result, and timestamps. Valid Channels are `web`, `whatsapp`, and `gmail`; Gmail is used only for security events. Valid tiers are `T0`, `T1`, `T2`, and `T3`; a T3 attempt is recorded as blocked and never executed through chat.
- A detected prompt-injection or identity-spoof attempt creates a `security_block` event even when no tool was called. `tool_name` and resource columns are nullable for these events.
- `event_type` is exactly `tool_call` or `security_block`. Tool-call result status is `succeeded`, `failed`, `blocked`, `awaiting_confirmation`, `reversed`, or `expired`.
- T2 confirmation is bound to the action fingerprint and `confirmation_expires_at`. An `agent_action_states` row with `purpose = 'confirmation'` retains the exact validated operation state until the confirmation is consumed or expires, including all resource IDs for `bulk_edit`.
- T1 responses expose the action ID and `undo_expires_at`. An `agent_action_states` row with `purpose = 'undo'` retains the minimal previous state or inverse operation needed to reverse the action; `reversed_action_id` links the undo log to the original action.
- Action state is backend-only, has exactly one purpose (`confirmation` or `undo`), is deleted after consumption or expiry, and never contains prompts, conversations, provider payloads, credentials, auth headers, tokens, or raw email/media content.
- The log never stores prompts, conversation text, tool arguments, raw provider content, auth headers, tokens, or financial field values. `request_fingerprint` is a keyed server-side fingerprint used only to bind a confirmation, not a hash of a secret or identity.

## Ownership and RLS

- Enable and force RLS on every public product table, including Reminder Preferences, Reminder Deliveries, Agent Action Logs, and Agent Action States. Agent Action States grant no direct browser access; only authenticated backend operations may read or mutate them after verifying ownership.
- Authenticated policies use `(select auth.uid()) = user_id`; `profiles` uses `(select auth.uid()) = id`.
- Revoke product-table access from `public` and `anon`. Grant only the operations required by authenticated flows.
- Every cross-table reference includes `user_id`, for example `(category_id, user_id) -> categories (id, user_id)`. This prevents a valid ID owned by another User from being attached to a row.
- Index every `user_id`, foreign-key column, Review Queue lookup `(user_id, review_status, created_at)` where `deleted_at is null`, dashboard lookup `(user_id, review_status, occurred_on)` where `deleted_at is null`, reminder schedule lookup `(status, scheduled_for)`, WhatsApp daily-cap lookup `(user_id, status, sent_at)`, and Agent audit lookup `(user_id, created_at)`.
- A service-role key bypasses RLS; server code must still verify the authenticated User and resource ownership before every financial operation.

## Migration order

1. Extensions, private helper functions, Profiles, Financial Accounts, and Categories.
2. Gmail Connections and Processed Gmail Messages.
3. Transactions with nullable pending fields, transfer constraints, and durable deduplication.
4. Budgets, Recurring Bills, Reminders, Reminder Preferences, and Reminder Deliveries.
5. WhatsApp Links, verification constraints, Agent Action Logs, and short-lived Agent Action States.
6. Soft-delete and idempotency indexes, triggers, grants, RLS policies, ownership tests, and synthetic seed data.

The ZO4 migration must be replayed on a fresh local Supabase stack and must include pgTAP ownership/RLS coverage before it can be considered complete.
