// Backend services and repositories belong here. Feature owners define financial
// models and operations alongside database migrations, not in the UI or worker.
export type { FinancialAccountId, TransactionReviewStatus, UserId } from "@monara/contracts";
export {
  BUDGET_ALERT_TEMPLATE,
  type BudgetAlertRepository,
  type BudgetAlertService,
  budgetAlertParameters,
  createBudgetAlertService,
  type SendBudgetAlert,
  WHATSAPP_DAILY_LIMIT,
} from "./budget-alerts.ts";
export {
  type ChatHistoryRepository,
  type ChatHistoryService,
  createChatHistoryService,
} from "./chat-history.ts";
export * from "./finance.ts";
export { createSupabaseGmailConnectionRepository } from "./gmail-connection-repository.ts";
export {
  createGmailConnectionService,
  GmailConnectionError,
  type GmailConnectionProvider,
  type GmailConnectionRepository,
  type GmailConnectionService,
  type StoredGmailConnection,
} from "./gmail-connections.ts";
export {
  type DiscoveryMailboxReader,
  discoveryNeedsRun,
  runGmailDiscovery,
} from "./gmail-discovery.ts";
export {
  GmailIngestionError,
  type GmailIngestionOperation,
  type GmailIngestionRepository,
  isGmailIngestionOperation,
  runGmailIngestionOperation,
} from "./gmail-ingestion.ts";
export { createProfileService, type ProfileRepository, type ProfileService } from "./profile.ts";
export { createSupabaseBudgetAlertRepository } from "./supabase-budget-alert-repository.ts";
export { createSupabaseChatHistoryRepository } from "./supabase-chat-history-repository.ts";
export { createSupabaseFinanceRepository } from "./supabase-finance-repository.ts";
export { createSupabaseGmailIngestionRepository } from "./supabase-gmail-ingestion-repository.ts";
export { createSupabaseProfileRepository } from "./supabase-profile-repository.ts";
export { createSupabaseUserDeletionRepository } from "./supabase-user-deletion-repository.ts";
export { createSupabaseWhatsAppLinkRepository } from "./supabase-whatsapp-link-repository.ts";
export { createUserDeletionService, type UserDeletionRepository } from "./user-deletion.ts";
export * from "./whatsapp-link.ts";
export {
  createWhatsAppLinkService,
  type StoredWhatsAppLink,
  type WhatsAppLinkRepository,
  type WhatsAppLinkService,
} from "./whatsapp-links.ts";
