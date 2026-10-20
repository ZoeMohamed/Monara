import { createHmac, timingSafeEqual } from "node:crypto";
import {
  type ChatExchange,
  type ChatHistorySaveStatus,
  chatExchangeSchema,
} from "@monara/contracts";

const RECOVERY_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const TOKEN_MAX_CHARACTERS = 200_000;
const TOKEN_PURPOSE = "monara:chat-history:v1:";

function signature(payload: string, secret: string): Buffer {
  if (!secret.trim()) throw new Error("Chat history recovery is unavailable.");
  return createHmac("sha256", secret).update(TOKEN_PURPOSE).update(payload).digest();
}

/** Only the web backend can issue a receipt. It carries no renewed Agent permission. */
export function issueChatHistoryRecovery(
  userId: string,
  exchange: ChatExchange,
  secret: string,
  now = Date.now(),
): Extract<ChatHistorySaveStatus, { status: "pending" }> {
  const validated = chatExchangeSchema.parse(exchange);
  const expiresAt = new Date(now + RECOVERY_LIFETIME_MS).toISOString();
  const payload = Buffer.from(
    JSON.stringify({
      version: 1,
      userId,
      expiresAt,
      exchange: {
        ...validated,
        response: {
          reply: validated.response.reply,
          actions: validated.response.actions,
          confirmation: validated.response.confirmation,
        },
      },
    }),
  ).toString("base64url");
  const recoveryToken = `${payload}.${signature(payload, secret).toString("base64url")}`;
  if (recoveryToken.length > TOKEN_MAX_CHARACTERS)
    throw new Error("This chat reply is too large to retain safely.");
  return { status: "pending", exchangeId: exchange.exchangeId, recoveryToken, expiresAt };
}

/** The signed-in owner and exact server-verified contents must both match. */
export function verifyChatHistoryRecovery(
  recoveryToken: string,
  userId: string,
  secret: string,
  now = Date.now(),
): ChatExchange {
  const invalid = "This saved reply couldn’t be verified. Copy the chat before leaving.";
  if (recoveryToken.length > TOKEN_MAX_CHARACTERS) throw new Error(invalid);
  const parts = recoveryToken.split(".");
  if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part)))
    throw new Error(invalid);
  const [payload, provided] = parts;
  const expected = signature(payload, secret);
  const actual = Buffer.from(provided, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error(invalid);
  const value: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("userId" in value) ||
    value.userId !== userId ||
    !("expiresAt" in value) ||
    typeof value.expiresAt !== "string" ||
    !("exchange" in value)
  )
    throw new Error(invalid);
  const expiresAt = Date.parse(value.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now)
    throw new Error(
      "The history save link expired. Copy this chat before leaving. Your financial records are unchanged by this retry.",
    );
  return chatExchangeSchema.parse(value.exchange);
}
