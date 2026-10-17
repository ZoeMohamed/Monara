import {
  type CreateFinancialAccountInput,
  emailInstitutions,
  type GmailAccountSuggestion,
  type Institution,
  type InstitutionPlatform,
} from "@monara/contracts";

/** A bank, card, or wallet the User is setting up to import from. */
export type BankChoice = {
  institutionKey: string;
  provider: string;
  name: string;
  platform: InstitutionPlatform;
  /** Emails found in the last 30 days; 0 for banks the User added by hand. */
  emailCount: number;
  lastFours: string[];
  /** The User already has a Financial Account for this one, so nothing is created. */
  linked: boolean;
  manual: boolean;
};

export function choiceFromSuggestion(suggestion: GmailAccountSuggestion): BankChoice {
  return {
    institutionKey: suggestion.institutionKey,
    provider: suggestion.provider,
    name: suggestion.name,
    platform: suggestion.platform,
    emailCount: suggestion.emailCount,
    lastFours: suggestion.lastFours,
    linked: suggestion.linkedAccounts.length > 0,
    manual: false,
  };
}

function choiceFromInstitution(institution: Institution): BankChoice {
  return {
    institutionKey: institution.key,
    provider: institution.provider,
    name: institution.name,
    platform: institution.platform,
    emailCount: 0,
    lastFours: [],
    linked: false,
    manual: true,
  };
}

/** "BCA · MyBCA", or just the name when provider and name match. */
export function choiceTitle(choice: Pick<BankChoice, "provider" | "name">): string {
  return choice.name === choice.provider ? choice.name : `${choice.provider} · ${choice.name}`;
}

export function addChoice(choices: BankChoice[], institution: Institution): BankChoice[] {
  if (choices.some((choice) => choice.institutionKey === institution.key)) return choices;
  return [...choices, choiceFromInstitution(institution)];
}

export function removeChoice(choices: BankChoice[], institutionKey: string): BankChoice[] {
  return choices.filter((choice) => choice.institutionKey !== institutionKey);
}

/** Registry banks Gmail can read that are not listed yet, matching a search. */
export function institutionsToAdd(choices: readonly BankChoice[], query: string): Institution[] {
  const taken = new Set(choices.map((choice) => choice.institutionKey));
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return emailInstitutions
    .filter((entry) => {
      if (taken.has(entry.key)) return false;
      const haystack = `${entry.provider} ${entry.name}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    })
    .toSorted((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));
}

/**
 * The account that Gmail imports for this bank go to. Pass the same request id on a retry:
 * the backend then returns the account it already created instead of making a second one.
 */
/** The account to create for a choice, fed by the mailbox it was found in when there is one. */
export function accountInputFor(
  choice: BankChoice,
  clientRequestId: string = crypto.randomUUID(),
  gmailConnectionId: string | null = null,
): CreateFinancialAccountInput {
  return {
    name: choice.name,
    institution: choice.provider,
    accountType: choice.platform === "E_WALLET" ? "wallet" : "bank",
    currency: "IDR",
    lastFour: choice.lastFours.length === 1 ? (choice.lastFours[0] ?? null) : null,
    institutionKey: choice.institutionKey,
    gmailConnectionId,
    clientRequestId,
  };
}

/** Choices that still need a Financial Account before Gmail can import for them. */
export function choicesToCreate(choices: readonly BankChoice[]): BankChoice[] {
  return choices.filter((choice) => !choice.linked);
}
