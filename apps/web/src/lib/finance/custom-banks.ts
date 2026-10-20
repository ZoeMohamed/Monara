import {
  type CreateCustomBankInput,
  type CustomBank,
  createCustomBankInputSchema,
  createCustomBankResultSchema,
  customBankKey,
  customBankSchema,
  type UpdateCustomBankInput,
  updateCustomBankInputSchema,
} from "@monara/contracts";

function rejectDuplicateSenders(
  banks: readonly CustomBank[],
  senders: readonly string[],
  exceptId?: string,
) {
  const addresses = new Set(senders);
  if (
    banks.some(
      (bank) => bank.id !== exceptId && bank.senderEmails.some((sender) => addresses.has(sender)),
    )
  ) {
    throw new Error(
      "This sender is already used by one of your custom banks. Choose that bank instead.",
    );
  }
}

/** Synthetic records only. The signed-in flow always uses the owned backend operation. */
export function createDemoBank(input: CreateCustomBankInput, banks: readonly CustomBank[]) {
  const values = createCustomBankInputSchema.parse(input);
  rejectDuplicateSenders(banks, values.senderEmails);
  const now = new Date().toISOString();
  const bank = {
    id: values.bankId,
    key: customBankKey(values.bankId),
    name: values.name,
    platform: values.platform,
    logo: values.logo,
    senderEmails: values.senderEmails,
    createdAt: now,
    updatedAt: now,
  };
  return createCustomBankResultSchema.parse({
    customBank: bank,
    financialAccount: {
      id: crypto.randomUUID(),
      name: values.accountName,
      institution: values.name,
      institutionKey: bank.key,
      institutionLogo: values.logo,
      accountType: values.platform === "E_WALLET" ? "wallet" : "bank",
      currency: "IDR",
      lastFour: values.lastFour,
      gmailConnectionId: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  });
}

export function editDemoBank(input: UpdateCustomBankInput, banks: readonly CustomBank[]) {
  const values = updateCustomBankInputSchema.parse(input);
  const bank = banks.find((entry) => entry.id === values.bankId);
  if (!bank || bank.updatedAt !== values.expectedUpdatedAt)
    throw new Error("This bank changed. Close the form and try again.");
  rejectDuplicateSenders(banks, values.senderEmails, bank.id);
  return customBankSchema.parse({
    ...bank,
    name: values.name,
    logo: values.logo,
    senderEmails: values.senderEmails,
    updatedAt: new Date().toISOString(),
  });
}
