// Email parsing shared by every Gmail flow: onboarding, account add, the Composio
// trigger, and the daily cron all reach it through the gmail.parse job.
import type { Institution } from "@monara/contracts";
import type { EmailForExtraction } from "../email-text.ts";
import type { LlmClient } from "../llm.ts";
import { type ExtractionResult, extractTransactions } from "./extract.ts";

export { applyHolderRules, isHolderName } from "./holder.ts";
export { shouldParse } from "./prefilter.ts";

export interface ParseContext {
  /** profiles.full_name, else the Google account name; null when neither is known. */
  holderName: string | null;
  /** The sender's registry entry, already checked against the User's accounts. */
  institution: Institution;
}

/** One model call, then the guards. Never guesses amounts, dates, or accounts. */
export function parseEmail(
  llm: LlmClient,
  email: EmailForExtraction,
  context: ParseContext,
): Promise<ExtractionResult> {
  return extractTransactions(llm, email, {
    holderName: context.holderName,
    institutionName: `${context.institution.name} (${context.institution.provider})`,
  });
}
