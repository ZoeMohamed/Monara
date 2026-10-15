// Backend services and repositories belong here. Feature owners define financial
// models and operations alongside database migrations, not in the UI or worker.
export type { FinancialAccountId, TransactionReviewStatus, UserId } from "@monara/contracts";
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
  GmailIngestionError,
  type GmailIngestionOperation,
  type GmailIngestionRepository,
  isGmailIngestionOperation,
  runGmailIngestionOperation,
} from "./gmail-ingestion.ts";
export { createSupabaseFinanceRepository } from "./supabase-finance-repository.ts";
export { createSupabaseGmailIngestionRepository } from "./supabase-gmail-ingestion-repository.ts";
export * from "./whatsapp-link.ts";
