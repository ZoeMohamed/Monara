import {
  type CreateCustomBankInput,
  type CustomBank,
  customBankListSchema,
  type UpdateCustomBankInput,
} from "@monara/contracts";
import type { MonaraServiceRoleClient } from "@monara/db";
import { FinanceOperationError } from "./finance.ts";

function customBankError(error: { code?: string }): never {
  if (error.code === "23505")
    throw new FinanceOperationError(
      "CONFLICT",
      "This sender is already used by one of your custom banks, or that request ID was already used. Choose the existing bank or refresh and try again.",
    );
  if (error.code === "40001")
    throw new FinanceOperationError("CONFLICT", "This bank changed. Refresh and try again.");
  if (error.code === "P0002")
    throw new FinanceOperationError("NOT_FOUND", "That custom bank was not found.");
  if (error.code === "23503")
    throw new FinanceOperationError("FORBIDDEN", "A related bank or mailbox is unavailable.");
  if (["23514", "22P02", "22023"].includes(error.code ?? ""))
    throw new FinanceOperationError(
      "VALIDATION_FAILED",
      "Check the bank details and selected mailbox.",
    );
  throw new FinanceOperationError("INTERNAL", "The custom bank could not be saved.");
}

/** All reads are explicitly owned, including service-role reads used by Gmail. */
export async function loadCustomBanks(
  client: MonaraServiceRoleClient,
  userId: string,
): Promise<CustomBank[]> {
  const { data, error } = await client
    .from("custom_banks")
    .select(
      "id, institution_key, name, platform, logo, created_at, updated_at, custom_bank_senders(sender_email)",
    )
    .eq("user_id", userId)
    .order("name", { ascending: true })
    .limit(101);
  if (error) customBankError(error);
  return customBankListSchema.parse(
    data.map((bank) => ({
      id: bank.id,
      key: bank.institution_key,
      name: bank.name,
      platform: bank.platform,
      logo: bank.logo,
      senderEmails: bank.custom_bank_senders.map((sender) => sender.sender_email).sort(),
      createdAt: bank.created_at,
      updatedAt: bank.updated_at,
    })),
  );
}

export async function insertCustomBankAccount(
  client: MonaraServiceRoleClient,
  userId: string,
  input: CreateCustomBankInput,
): Promise<string> {
  const { bankId, clientRequestId, ...values } = input;
  const { data, error } = await client.rpc("create_custom_bank_account", {
    p_user_id: userId,
    p_bank_id: bankId,
    p_client_request_id: clientRequestId,
    p_values: values,
  });
  if (error) customBankError(error);
  return data;
}

export async function replaceCustomBank(
  client: MonaraServiceRoleClient,
  userId: string,
  input: UpdateCustomBankInput,
): Promise<CustomBank> {
  const { bankId, expectedUpdatedAt, ...values } = input;
  const { error } = await client.rpc("update_custom_bank", {
    p_user_id: userId,
    p_bank_id: bankId,
    p_expected_updated_at: expectedUpdatedAt,
    p_values: values,
  });
  if (error) customBankError(error);
  const bank = (await loadCustomBanks(client, userId)).find((entry) => entry.id === bankId);
  if (!bank) throw new FinanceOperationError("NOT_FOUND", "That custom bank was not found.");
  return bank;
}
