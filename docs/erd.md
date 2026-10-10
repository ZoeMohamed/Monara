# Monara ERD

Status: design only. This document does not create or migrate any database.

## Scope

Monara is single-user personal finance software. Supabase team members are project collaborators, not tenants inside the product. Every financial row belongs to one authenticated user.

The design is split into three delivery phases so the MVP can ship without carrying asset-management complexity.

## Phase 1 — automatic expense tracking

```mermaid
erDiagram
    AUTH_USERS ||--|| PROFILES : has
    AUTH_USERS ||--o{ CATEGORIES : owns
    AUTH_USERS ||--o{ FINANCIAL_ACCOUNTS : owns
    AUTH_USERS ||--o{ DATA_CONNECTIONS : authorizes
    AUTH_USERS ||--o{ TRANSACTIONS : owns
    DATA_CONNECTIONS ||--o{ INGESTION_RECORDS : receives
    INGESTION_RECORDS o|--o{ TRANSACTIONS : produces
    FINANCIAL_ACCOUNTS o|--o{ TRANSACTIONS : contains
    CATEGORIES o|--o{ TRANSACTIONS : classifies

    AUTH_USERS {
        uuid id PK
    }

    PROFILES {
        uuid user_id PK,FK
        text display_name
        text timezone
        char currency
        timestamptz created_at
        timestamptz updated_at
    }

    CATEGORIES {
        bigint id PK
        uuid user_id FK
        text name
        text slug
        text icon
        text color
        boolean is_archived
    }

    FINANCIAL_ACCOUNTS {
        bigint id PK
        uuid user_id FK
        text name
        text institution
        text account_type
        char currency
        numeric current_balance
        timestamptz balance_as_of
        text last_four
        boolean is_active
    }

    DATA_CONNECTIONS {
        bigint id PK
        uuid user_id FK
        text connection_type
        text provider
        text provider_connection_id
        text display_label
        text status
        timestamptz last_synced_at
        timestamptz created_at
    }

    INGESTION_RECORDS {
        bigint id PK
        uuid user_id FK
        bigint data_connection_id FK
        text external_id
        text source_type
        text sender
        text subject
        text payload_hash
        timestamptz occurred_at
        text processing_status
        timestamptz processed_at
    }

    TRANSACTIONS {
        bigint id PK
        uuid user_id FK
        bigint financial_account_id FK
        bigint category_id FK
        bigint ingestion_record_id FK
        text transaction_type
        text merchant_name
        numeric amount
        char currency
        timestamptz occurred_at
        text description
        text location
        numeric ai_confidence
        text review_status
        text dedupe_key
        timestamptz created_at
        timestamptz updated_at
    }
```

Important constraints:

- `data_connections (user_id, provider, provider_connection_id)` is unique.
- `ingestion_records (data_connection_id, external_id)` is unique so one email or provider event is processed once.
- `transactions (user_id, dedupe_key)` is unique when `dedupe_key` is present.
- `amount` is positive and exact; `transaction_type` carries `expense`, `income`, or `transfer`.
- Imported transactions start as `pending`. Only `confirmed` transactions count toward totals and budgets.
- OAuth tokens and raw email bodies are not stored in public tables. Keep credentials in the provider/backend secret store.

## Phase 2 — budgets, bills, reminders, and chat agents

```mermaid
erDiagram
    AUTH_USERS ||--o{ BUDGETS : owns
    AUTH_USERS ||--o{ RECURRING_BILLS : owns
    AUTH_USERS ||--o{ CHANNEL_CONNECTIONS : verifies
    AUTH_USERS ||--o{ NOTIFICATIONS : receives
    CATEGORIES o|--o{ BUDGETS : limits
    FINANCIAL_ACCOUNTS o|--o{ RECURRING_BILLS : charges
    RECURRING_BILLS o|--o{ TRANSACTIONS : matches
    CHANNEL_CONNECTIONS ||--o{ AGENT_ACTIONS : submits
    CHANNEL_CONNECTIONS o|--o{ NOTIFICATIONS : delivers

    BUDGETS {
        bigint id PK
        uuid user_id FK
        bigint category_id FK
        text name
        text cadence
        numeric limit_amount
        char currency
        smallint warning_percent
        date starts_on
        date ends_on
        boolean is_active
    }

    RECURRING_BILLS {
        bigint id PK
        uuid user_id FK
        bigint financial_account_id FK
        text merchant_name
        text description
        numeric expected_amount
        char currency
        smallint interval_count
        text interval_unit
        date next_due_on
        text status
        text cancellation_url
        timestamptz created_at
        timestamptz updated_at
    }

    CHANNEL_CONNECTIONS {
        bigint id PK
        uuid user_id FK
        text provider
        text provider_contact_id
        text handle_hmac
        text handle_last_four
        text status
        timestamptz verified_at
    }

    AGENT_ACTIONS {
        bigint id PK
        uuid user_id FK
        bigint channel_connection_id FK
        text action
        text entity_type
        text entity_id
        text idempotency_key
        text status
        text failure_code
        timestamptz created_at
        timestamptz completed_at
    }

    NOTIFICATIONS {
        bigint id PK
        uuid user_id FK
        bigint channel_connection_id FK
        text notification_type
        text entity_type
        text entity_id
        text channel
        text status
        timestamptz scheduled_for
        timestamptz delivered_at
    }
```

Budget usage is derived from confirmed transactions. Do not create a mutable `budget_spent` column. A recurring bill may be detected automatically, but the user confirms it before reminders become active.

Phase 2 adds nullable `transactions.recurring_bill_id`. Keep `(user_id, idempotency_key)` unique on `agent_actions` so provider retries cannot repeat a write.

`agent_actions` is an audit and idempotency record for WhatsApp/WeChat CRUD. It stores the interpreted action, not raw conversation content.

## Phase 3 — assets and risk profile

```mermaid
erDiagram
    AUTH_USERS ||--o{ POSITIONS : owns
    AUTH_USERS ||--o{ RISK_ASSESSMENTS : owns
    FINANCIAL_ACCOUNTS o|--o{ POSITIONS : holds
    POSITIONS ||--o{ POSITION_VALUATIONS : valued_by

    POSITIONS {
        bigint id PK
        uuid user_id FK
        bigint financial_account_id FK
        text name
        text position_type
        text asset_class
        text symbol
        numeric quantity
        char currency
        text source
        boolean is_active
    }

    POSITION_VALUATIONS {
        bigint id PK
        uuid user_id FK
        bigint position_id FK
        numeric value_amount
        char currency
        text valuation_source
        timestamptz valued_at
    }

    RISK_ASSESSMENTS {
        bigint id PK
        uuid user_id FK
        smallint risk_score
        text risk_level
        jsonb answers
        jsonb allocation_snapshot
        text model_version
        timestamptz assessed_at
    }
```

Assets and liabilities share `positions`; `position_type` distinguishes them. Bank, brokerage, exchange, and crypto-wallet holdings reuse `financial_accounts` instead of introducing provider-specific account tables. On-chain transactions reuse the Phase 1 transaction pipeline; the provider event or transaction hash lives in `ingestion_records.external_id`.

## Security and integrity rules

- Every public table enables RLS and checks `user_id = (select auth.uid())`.
- Every `user_id` used by RLS is indexed.
- Child references must belong to the same user; enforce this with composite foreign keys such as `(financial_account_id, user_id)`.
- Foreign-key columns are indexed.
- Money uses `numeric`, time uses `timestamptz`, and currencies use uppercase ISO 4217 codes.
- Public clients use only the Supabase publishable key. Secret/service-role keys never enter the PWA.
- Never use profile metadata supplied by the user for authorization.

## Build order

1. Profiles, categories, financial accounts.
2. Email connection metadata and ingestion deduplication.
3. Pending/confirmed transactions.
4. Budgets and recurring bills.
5. Notifications and verified WhatsApp/WeChat actions.
6. Positions, valuations, and risk assessments.

Do not add merchant normalization, shared households, exchange-specific tables, receipt storage, or materialized dashboard totals until real usage proves they are needed.
