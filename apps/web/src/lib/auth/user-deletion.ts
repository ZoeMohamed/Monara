import {
  createSupabaseUserDeletionRepository,
  createUserDeletionService,
  FinanceOperationError,
} from "@monara/core";
import { createMonaraServiceRoleClient } from "@monara/db";
import {
  createComposioGmailClient,
  createComposioGmailTriggers,
  createComposioUserCleanup,
} from "@monara/integrations";
import { cookies } from "next/headers";
import { DELETION_COOKIE, userIdFromDeletionReceipt } from "@/lib/auth/deletion-receipt";
import { publicSupabaseConfig } from "@/lib/supabase/config";

function client() {
  return createMonaraServiceRoleClient(
    publicSupabaseConfig(),
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/** Used by trusted Agent operations as well as the browser session boundary. */
export async function isUserActive(userId: string): Promise<boolean> {
  const result = await client().rpc("monara_user_is_active", { p_user_id: userId });
  if (result.error)
    throw new FinanceOperationError("DEPENDENCY_UNAVAILABLE", "Account status is unavailable.");
  return result.data;
}

export async function requireActiveUser(userId: string): Promise<void> {
  if (!(await isUserActive(userId))) {
    throw new FinanceOperationError("UNAUTHENTICATED", "This account is no longer available.");
  }
}

export async function deletionStatus(): Promise<"pending" | "complete" | null> {
  const userId = userIdFromDeletionReceipt(
    (await cookies()).get(DELETION_COOKIE)?.value,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  );
  if (!userId) return null;
  const result = await client()
    .from("user_deletions")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (result.error) throw new Error("Deletion status is unavailable.");
  return result.data ? "pending" : "complete";
}

function service() {
  return createUserDeletionService({
    repository: createSupabaseUserDeletionRepository(client()),
    cleanProviderUser: (userId) => {
      return createComposioUserCleanup({
        apiUrl: process.env.COMPOSIO_API_URL ?? "",
        apiKey: process.env.COMPOSIO_API_KEY ?? "",
      }).removeNext(userId);
    },
    async purgeWhatsApp(userId) {
      const agentUrl = process.env.MONARA_AGENT_URL?.trim();
      const secret = process.env.MONARA_AGENT_BACKEND_SECRET?.trim();
      if (!agentUrl || !secret) throw new Error("Account cleanup is not configured.");
      const response = await fetch(new URL("/users/purge", agentUrl), {
        method: "POST",
        cache: "no-store",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error("Conversation cleanup is unavailable.");
    },
    removeTrigger: (id) =>
      createComposioGmailTriggers({
        apiUrl: process.env.COMPOSIO_API_URL ?? "",
        apiKey: process.env.COMPOSIO_API_KEY ?? "",
      }).remove(id),
    revokeConnection: (id) =>
      createComposioGmailClient({
        apiUrl: process.env.COMPOSIO_API_URL ?? "",
        apiKey: process.env.COMPOSIO_API_KEY ?? "",
        authConfigId: process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID ?? "",
      }).deleteConnection(id),
  });
}

/** Both the immediate wake-up and the scheduled recovery drain the same durable jobs. */
export async function processUserDeletions(userId?: string): Promise<number> {
  const cleanup = service();
  const deadline = Date.now() + 10_000;
  let steps = 0;
  while (Date.now() < deadline && steps < 20) {
    const outcome = await cleanup.processNext(userId);
    if (outcome === "idle") break;
    steps += 1;
    if (userId && (outcome === "complete" || outcome === "retry")) break;
  }
  return steps;
}
