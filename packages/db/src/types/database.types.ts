
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {

  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "agent_action_logs": {
                  Row: {
                    "channel": string,"confirmation_expires_at": string | null,"created_at": string,"event_type": string,"id": string,"permission_tier": string | null,"request_fingerprint": string | null,"resource_id": string | null,"resource_type": string | null,"result_status": string,"reversed_action_id": string | null,"tool_name": string | null,"undo_expires_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "channel": string,"confirmation_expires_at"?: string | null,"created_at"?: string,"event_type": string,"id"?: string,"permission_tier"?: string | null,"request_fingerprint"?: string | null,"resource_id"?: string | null,"resource_type"?: string | null,"result_status": string,"reversed_action_id"?: string | null,"tool_name"?: string | null,"undo_expires_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "channel"?: string,"confirmation_expires_at"?: string | null,"created_at"?: string,"event_type"?: string,"id"?: string,"permission_tier"?: string | null,"request_fingerprint"?: string | null,"resource_id"?: string | null,"resource_type"?: string | null,"result_status"?: string,"reversed_action_id"?: string | null,"tool_name"?: string | null,"undo_expires_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_action_logs_reversed_action_id_user_id_fkey"
      columns: ["reversed_action_id","user_id"]
isOneToOne: false
      referencedRelation: "agent_action_logs"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"agent_action_states": {
                  Row: {
                    "action_id": string,"consumed_at": string | null,"created_at": string,"expires_at": string,"operation_state": NonNullable<Json>,"purpose": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action_id": string,"consumed_at"?: string | null,"created_at"?: string,"expires_at": string,"operation_state": NonNullable<Json>,"purpose": string,"user_id": string
                  }
                  Update: {
                    "action_id"?: string,"consumed_at"?: string | null,"created_at"?: string,"expires_at"?: string,"operation_state"?: NonNullable<Json>,"purpose"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_action_states_action_id_user_id_fkey"
      columns: ["action_id","user_id"]
isOneToOne: false
      referencedRelation: "agent_action_logs"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"budgets": {
                  Row: {
                    "cadence": string,"category_id": string,"client_request_id": string,"created_at": string,"currency": string,"deleted_at": string | null,"id": string,"is_active": boolean,"limit_amount": number,"name": string,"starts_on": string,"updated_at": string,"user_id": string,"warning_percent": number
                  }
                  ComputedFields: never
                  Insert: {
                    "cadence": string,"category_id": string,"client_request_id": string,"created_at"?: string,"currency"?: string,"deleted_at"?: string | null,"id"?: string,"is_active"?: boolean,"limit_amount": number,"name": string,"starts_on": string,"updated_at"?: string,"user_id": string,"warning_percent"?: number
                  }
                  Update: {
                    "cadence"?: string,"category_id"?: string,"client_request_id"?: string,"created_at"?: string,"currency"?: string,"deleted_at"?: string | null,"id"?: string,"is_active"?: boolean,"limit_amount"?: number,"name"?: string,"starts_on"?: string,"updated_at"?: string,"user_id"?: string,"warning_percent"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "budgets_category_id_user_id_fkey"
      columns: ["category_id","user_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "color": string,"created_at": string,"icon": string,"id": string,"is_archived": boolean,"is_default": boolean,"name": string,"slug": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color": string,"created_at"?: string,"icon": string,"id"?: string,"is_archived"?: boolean,"is_default"?: boolean,"name": string,"slug": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"icon"?: string,"id"?: string,"is_archived"?: boolean,"is_default"?: boolean,"name"?: string,"slug"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"chat_conversations": {
                  Row: {
                    "created_at": string,"id": string,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id": string,"title": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"chat_messages": {
                  Row: {
                    "closed_confirmation": boolean,"conversation_id": string,"created_at": string,"id": string,"result": Json | null,"role": string,"seq": number,"text": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "closed_confirmation"?: boolean,"conversation_id": string,"created_at"?: string,"id"?: string,"result"?: Json | null,"role": string,"seq"?: never,"text": string,"user_id": string
                  }
                  Update: {
                    "closed_confirmation"?: boolean,"conversation_id"?: string,"created_at"?: string,"id"?: string,"result"?: Json | null,"role"?: string,"seq"?: never,"text"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "chat_messages_conversation_id_user_id_fkey"
      columns: ["conversation_id","user_id"]
isOneToOne: false
      referencedRelation: "chat_conversations"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"financial_accounts": {
                  Row: {
                    "account_type": string,"client_request_id": string,"created_at": string,"currency": string,"gmail_connection_id": string | null,"id": string,"institution": string | null,"institution_key": string | null,"is_active": boolean,"last_four": string | null,"name": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_type": string,"client_request_id": string,"created_at"?: string,"currency"?: string,"gmail_connection_id"?: string | null,"id"?: string,"institution"?: string | null,"institution_key"?: string | null,"is_active"?: boolean,"last_four"?: string | null,"name": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "account_type"?: string,"client_request_id"?: string,"created_at"?: string,"currency"?: string,"gmail_connection_id"?: string | null,"id"?: string,"institution"?: string | null,"institution_key"?: string | null,"is_active"?: boolean,"last_four"?: string | null,"name"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "financial_accounts_gmail_connection_fkey"
      columns: ["gmail_connection_id","user_id"]
isOneToOne: false
      referencedRelation: "gmail_connections"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"financial_goals": {
                  Row: {
                    "client_request_id": string,"created_at": string,"currency": string,"deleted_at": string | null,"id": string,"image_path": string | null,"name": string,"saved_amount": number,"status": string | null,"target_amount": number,"target_date": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_request_id": string,"created_at"?: string,"currency"?: string,"deleted_at"?: string | null,"id"?: string,"image_path"?: string | null,"name": string,"saved_amount"?: number,"status"?: never,"target_amount": number,"target_date": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "client_request_id"?: string,"created_at"?: string,"currency"?: string,"deleted_at"?: string | null,"id"?: string,"image_path"?: string | null,"name"?: string,"saved_amount"?: number,"status"?: never,"target_amount"?: number,"target_date"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"gmail_connections": {
                  Row: {
                    "composio_connected_account_id": string,"composio_trigger_id": string | null,"created_at": string,"discovery_first_completed_at": string | null,"discovery_state": string,"discovery_updated_at": string | null,"gmail_address": string,"id": string,"last_synced_at": string | null,"status": string,"sync_error": string | null,"sync_pending_runs": number,"sync_requested_at": string | null,"sync_state": string,"sync_updated_at": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "composio_connected_account_id": string,"composio_trigger_id"?: string | null,"created_at"?: string,"discovery_first_completed_at"?: string | null,"discovery_state"?: string,"discovery_updated_at"?: string | null,"gmail_address": string,"id"?: string,"last_synced_at"?: string | null,"status"?: string,"sync_error"?: string | null,"sync_pending_runs"?: number,"sync_requested_at"?: string | null,"sync_state"?: string,"sync_updated_at"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "composio_connected_account_id"?: string,"composio_trigger_id"?: string | null,"created_at"?: string,"discovery_first_completed_at"?: string | null,"discovery_state"?: string,"discovery_updated_at"?: string | null,"gmail_address"?: string,"id"?: string,"last_synced_at"?: string | null,"status"?: string,"sync_error"?: string | null,"sync_pending_runs"?: number,"sync_requested_at"?: string | null,"sync_state"?: string,"sync_updated_at"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"gmail_institution_discoveries": {
                  Row: {
                    "discovered_at": string,"dismissed_at": string | null,"email_count": number,"first_seen_at": string,"gmail_connection_id": string,"institution_key": string,"last_fours": (string)[],"last_seen_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "discovered_at"?: string,"dismissed_at"?: string | null,"email_count": number,"first_seen_at"?: string,"gmail_connection_id": string,"institution_key": string,"last_fours"?: (string)[],"last_seen_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "discovered_at"?: string,"dismissed_at"?: string | null,"email_count"?: number,"first_seen_at"?: string,"gmail_connection_id"?: string,"institution_key"?: string,"last_fours"?: (string)[],"last_seen_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "gmail_institution_discoveries_gmail_connection_id_user_id_fkey"
      columns: ["gmail_connection_id","user_id"]
isOneToOne: false
      referencedRelation: "gmail_connections"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"merchant_profiles": {
                  Row: {
                    "claimed_at": string | null,"expires_at": string | null,"merchant_key": string,"status": string,"summary": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "claimed_at"?: string | null,"expires_at"?: string | null,"merchant_key": string,"status": string,"summary"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "claimed_at"?: string | null,"expires_at"?: string | null,"merchant_key"?: string,"status"?: string,"summary"?: string | null,"updated_at"?: string
                  }
                  Relationships: [

                  ]
                },"processed_gmail_messages": {
                  Row: {
                    "created_at": string,"gmail_connection_id": string,"gmail_message_id": string,"id": string,"processed_at": string | null,"processing_status": string,"received_at": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"gmail_connection_id": string,"gmail_message_id": string,"id"?: string,"processed_at"?: string | null,"processing_status"?: string,"received_at": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"gmail_connection_id"?: string,"gmail_message_id"?: string,"id"?: string,"processed_at"?: string | null,"processing_status"?: string,"received_at"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "processed_gmail_messages_gmail_connection_id_user_id_fkey"
      columns: ["gmail_connection_id","user_id"]
isOneToOne: false
      referencedRelation: "gmail_connections"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"currency": string,"display_name": string,"full_name": string | null,"id": string,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"currency"?: string,"display_name": string,"full_name"?: string | null,"id": string,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string,"display_name"?: string,"full_name"?: string | null,"id"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [

                  ]
                },"recurring_bills": {
                  Row: {
                    "ai_confidence": number | null,"cancellation_url": string | null,"client_request_id": string,"created_at": string,"currency": string,"deleted_at": string | null,"expected_amount": number,"financial_account_id": string | null,"id": string,"interval_count": number,"interval_unit": string,"merchant_name": string,"next_due_on": string,"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_confidence"?: number | null,"cancellation_url"?: string | null,"client_request_id": string,"created_at"?: string,"currency"?: string,"deleted_at"?: string | null,"expected_amount": number,"financial_account_id"?: string | null,"id"?: string,"interval_count": number,"interval_unit": string,"merchant_name": string,"next_due_on": string,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "ai_confidence"?: number | null,"cancellation_url"?: string | null,"client_request_id"?: string,"created_at"?: string,"currency"?: string,"deleted_at"?: string | null,"expected_amount"?: number,"financial_account_id"?: string | null,"id"?: string,"interval_count"?: number,"interval_unit"?: string,"merchant_name"?: string,"next_due_on"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recurring_bills_financial_account_id_user_id_fkey"
      columns: ["financial_account_id","user_id"]
isOneToOne: false
      referencedRelation: "financial_accounts"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"reminder_deliveries": {
                  Row: {
                    "attempted_at": string | null,"channel": string,"created_at": string,"failure_code": string | null,"id": string,"provider_message_id": string | null,"reminder_id": string,"sent_at": string | null,"status": string,"template_name": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempted_at"?: string | null,"channel": string,"created_at"?: string,"failure_code"?: string | null,"id"?: string,"provider_message_id"?: string | null,"reminder_id": string,"sent_at"?: string | null,"status": string,"template_name"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "attempted_at"?: string | null,"channel"?: string,"created_at"?: string,"failure_code"?: string | null,"id"?: string,"provider_message_id"?: string | null,"reminder_id"?: string,"sent_at"?: string | null,"status"?: string,"template_name"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reminder_deliveries_reminder_id_user_id_fkey"
      columns: ["reminder_id","user_id"]
isOneToOne: false
      referencedRelation: "reminders"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"reminder_preferences": {
                  Row: {
                    "created_at": string,"updated_at": string,"user_id": string,"whatsapp_enabled": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"updated_at"?: string,"user_id": string,"whatsapp_enabled"?: boolean
                  }
                  Update: {
                    "created_at"?: string,"updated_at"?: string,"user_id"?: string,"whatsapp_enabled"?: boolean
                  }
                  Relationships: [

                  ]
                },"reminders": {
                  Row: {
                    "budget_id": string | null,"created_at": string,"dedupe_key": string,"id": string,"kind": string,"message": string,"offset_days": number | null,"period_starts_on": string | null,"read_at": string | null,"recurring_bill_id": string | null,"scheduled_for": string,"status": string,"threshold_percent": number | null,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "budget_id"?: string | null,"created_at"?: string,"dedupe_key": string,"id"?: string,"kind": string,"message": string,"offset_days"?: number | null,"period_starts_on"?: string | null,"read_at"?: string | null,"recurring_bill_id"?: string | null,"scheduled_for": string,"status"?: string,"threshold_percent"?: number | null,"title": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "budget_id"?: string | null,"created_at"?: string,"dedupe_key"?: string,"id"?: string,"kind"?: string,"message"?: string,"offset_days"?: number | null,"period_starts_on"?: string | null,"read_at"?: string | null,"recurring_bill_id"?: string | null,"scheduled_for"?: string,"status"?: string,"threshold_percent"?: number | null,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reminders_budget_id_user_id_fkey"
      columns: ["budget_id","user_id"]
isOneToOne: false
      referencedRelation: "budgets"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "reminders_recurring_bill_id_user_id_fkey"
      columns: ["recurring_bill_id","user_id"]
isOneToOne: false
      referencedRelation: "recurring_bills"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"transactions": {
                  Row: {
                    "account_hint": string | null,"ai_confidence": number | null,"amount": number | null,"category_id": string | null,"client_request_id": string | null,"created_at": string,"currency": string | null,"deleted_at": string | null,"description": string | null,"financial_account_id": string | null,"flow_direction": string | null,"gmail_auto_confirm_pending": boolean,"id": string,"location": string | null,"merchant_name": string | null,"occurred_on": string,"occurred_time": string | null,"processed_gmail_message_id": string | null,"recurring_bill_id": string | null,"review_status": string,"source_item_index": number | null,"source_type": string,"transaction_type": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_hint"?: string | null,"ai_confidence"?: number | null,"amount"?: number | null,"category_id"?: string | null,"client_request_id"?: string | null,"created_at"?: string,"currency"?: string | null,"deleted_at"?: string | null,"description"?: string | null,"financial_account_id"?: string | null,"flow_direction"?: string | null,"gmail_auto_confirm_pending"?: boolean,"id"?: string,"location"?: string | null,"merchant_name"?: string | null,"occurred_on"?: string,"occurred_time"?: string | null,"processed_gmail_message_id"?: string | null,"recurring_bill_id"?: string | null,"review_status": string,"source_item_index"?: number | null,"source_type": string,"transaction_type"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "account_hint"?: string | null,"ai_confidence"?: number | null,"amount"?: number | null,"category_id"?: string | null,"client_request_id"?: string | null,"created_at"?: string,"currency"?: string | null,"deleted_at"?: string | null,"description"?: string | null,"financial_account_id"?: string | null,"flow_direction"?: string | null,"gmail_auto_confirm_pending"?: boolean,"id"?: string,"location"?: string | null,"merchant_name"?: string | null,"occurred_on"?: string,"occurred_time"?: string | null,"processed_gmail_message_id"?: string | null,"recurring_bill_id"?: string | null,"review_status"?: string,"source_item_index"?: number | null,"source_type"?: string,"transaction_type"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transactions_category_id_user_id_fkey"
      columns: ["category_id","user_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "transactions_financial_account_id_user_id_fkey"
      columns: ["financial_account_id","user_id"]
isOneToOne: false
      referencedRelation: "financial_accounts"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "transactions_processed_gmail_message_id_user_id_fkey"
      columns: ["processed_gmail_message_id","user_id"]
isOneToOne: false
      referencedRelation: "processed_gmail_messages"
      referencedColumns: ["id","user_id"]
    },{
      foreignKeyName: "transactions_recurring_bill_id_user_id_fkey"
      columns: ["recurring_bill_id","user_id"]
isOneToOne: false
      referencedRelation: "recurring_bills"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"user_deletions": {
                  Row: {
                    "attempts": number,"connected_account_ids": (string)[],"created_at": string,"lease_token": string | null,"lease_until": string | null,"next_attempt_at": string,"trigger_ids": (string)[],"user_id": string,"whatsapp_purged": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"connected_account_ids"?: (string)[],"created_at"?: string,"lease_token"?: string | null,"lease_until"?: string | null,"next_attempt_at"?: string,"trigger_ids"?: (string)[],"user_id": string,"whatsapp_purged"?: boolean
                  }
                  Update: {
                    "attempts"?: number,"connected_account_ids"?: (string)[],"created_at"?: string,"lease_token"?: string | null,"lease_until"?: string | null,"next_attempt_at"?: string,"trigger_ids"?: (string)[],"user_id"?: string,"whatsapp_purged"?: boolean
                  }
                  Relationships: [

                  ]
                },"whatsapp_links": {
                  Row: {
                    "created_at": string,"id": string,"kapso_contact_id": string | null,"last_inbound_at": string | null,"phone_e164_ciphertext": string | null,"phone_e164_hmac": string,"phone_last_four": string,"status": string,"updated_at": string,"user_id": string,"verification_attempts": number,"verification_code_digest": string | null,"verification_expires_at": string | null,"verified_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"kapso_contact_id"?: string | null,"last_inbound_at"?: string | null,"phone_e164_ciphertext"?: string | null,"phone_e164_hmac": string,"phone_last_four": string,"status"?: string,"updated_at"?: string,"user_id": string,"verification_attempts"?: number,"verification_code_digest"?: string | null,"verification_expires_at"?: string | null,"verified_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kapso_contact_id"?: string | null,"last_inbound_at"?: string | null,"phone_e164_ciphertext"?: string | null,"phone_e164_hmac"?: string,"phone_last_four"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string,"verification_attempts"?: number,"verification_code_digest"?: string | null,"verification_expires_at"?: string | null,"verified_at"?: string | null
                  }
                  Relationships: [

                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "append_chat_exchange":
{ Args: { "p_agent_result": Json,"p_agent_text": string,"p_closed_confirmation": boolean,"p_conversation_id": string,"p_title": string,"p_user_id": string,"p_user_text": string }; Returns: undefined
                           },
"begin_user_deletion":
{ Args: { "p_acknowledged": boolean,"p_confirmation": string }; Returns: undefined
                           },
"claim_gmail_message":
{ Args: { "p_connection_id": string,"p_gmail_message_id": string,"p_received_at": string }; Returns: {
              "already_finished": boolean,"processed_message_id": string
            }[]
                           },
"claim_gmail_messages":
{ Args: { "p_connection_id": string,"p_messages": Json }; Returns: number
                           },
"claim_merchant_profile":
{ Args: { "p_merchant_key": string }; Returns: {
              "status": string,"summary": string
            }[]
                           },
"claim_user_deletion":
{ Args: { "p_user_id"?: string }; Returns: {
              "attempts": number,
"connected_account_ids": (string)[],
"created_at": string,
"lease_token": string | null,
"lease_until": string | null,
"next_attempt_at": string,
"trigger_ids": (string)[],
"user_id": string,
"whatsapp_purged": boolean
            }[]
                          SetofOptions: {
        from: "*"
        to: "user_deletions"
        isOneToOne: false
        isSetofReturn: true
      } },
"fail_gmail_discovery":
{ Args: { "p_connection_id": string }; Returns: undefined
                           },
"fail_gmail_sync":
{ Args: { "p_connection_id": string,"p_error": string,"p_requested_at"?: string }; Returns: undefined
                           },
"gmail_auto_confirm_confidence":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"gmail_connection_sync_counts":
{ Args: { "p_connection_id": string,"p_user_id": string }; Returns: {
              "failed": number,"imported": number,"imported_transactions": number,"in_progress": number,"skipped": number
            }[]
                           },
"gmail_item_account":
{ Args: { "p_connection_id": string,"p_institution_key": string,"p_kind": string,"p_last_four": string,"p_user_id": string }; Returns: string
                           },
"gmail_sync_stall_interval":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"gmail_sync_statuses":
{ Args: { "p_user_id": string }; Returns: {
              "confirmed_transactions": number,"connection_id": string,"error": string,"failed": number,"imported": number,"imported_transactions": number,"in_progress": number,"requested_at": string,"skipped": number,"state": string
            }[]
                           },
"imported_transaction_for_category":
{ Args: { "p_transaction_id": string }; Returns: {
              "location": string,"merchant_name": string,"needs_category": boolean,"user_id": string
            }[]
                           },
"join_gmail_sync":
{ Args: { "p_connection_id": string,"p_user_id": string }; Returns: string
                           },
"mark_gmail_connection_synced":
{ Args: { "p_connection_id": string,"p_synced_at": string }; Returns: undefined
                           },
"monara_session_is_active":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"monara_user_is_active":
{ Args: { "p_user_id": string }; Returns: boolean
                           },
"normalize_merchant_name":
{ Args: { "p_name": string }; Returns: string
                           },
"record_gmail_discovery":
{ Args: { "p_connection_id": string,"p_found": Json }; Returns: undefined
                           },
"record_gmail_extraction":
{ Args: { "p_institution_key"?: string,"p_items": Json,"p_outcome": string,"p_processed_message_id": string,"p_sender_verified": boolean }; Returns: {
              "already_finished": boolean,"transaction_ids": (string)[],"uncategorized_transaction_ids": (string)[]
            }[]
                           },
"release_merchant_profile":
{ Args: { "p_merchant_key": string }; Returns: undefined
                           },
"request_gmail_sync":
{ Args: { "p_connection_id": string,"p_user_id": string }; Returns: string
                           },
"save_merchant_profile":
{ Args: { "p_merchant_key": string,"p_summary"?: string }; Returns: undefined
                           },
"set_imported_category":
{ Args: { "p_category_name": string,"p_transaction_id": string }; Returns: {
              "applied": boolean,"review_status": string,"user_id": string
            }[]
                           },
"start_gmail_discovery":
{ Args: { "p_connection_id": string }; Returns: undefined
                           },
"start_gmail_sync":
{ Args: { "p_connection_id": string }; Returns: undefined
                           },
"user_merchant_category":
{ Args: { "p_merchant_name": string,"p_user_id": string }; Returns: string
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {

          }
        },"public": {
          Enums: {

          }
        }
} as const
