// WhatsApp budget alerts (PRD F13). A budget threshold Reminder always shows in
// the app; this decides whether it also goes to the User's WhatsApp, and when.
import type { BudgetAlertDetails } from "./finance.ts";
import { decryptPhone } from "./whatsapp-link.ts";

/** At most this many WhatsApp Reminders per User per local day. */
export const WHATSAPP_DAILY_LIMIT = 3;
/** Quiet hours in the User's timezone: alerts wait until they end. */
const QUIET_START_HOUR = 22;
const QUIET_END_HOUR = 7;
// The profile timezone is not read yet; Asia/Jakarta (UTC+7, no daylight saving) is its default.
const UTC_OFFSET_MS = 7 * 60 * 60 * 1000;
const DISPATCH_BATCH = 50;

export const BUDGET_ALERT_TEMPLATE = "budget_alert";

type DeliveryOutcome =
  | { status: "sent"; providerMessageId: string; failureCode: null }
  | { status: "skipped" | "failed"; providerMessageId: null; failureCode: string };

export interface BudgetAlertRepository {
  /** The sealed number of a verified link whose User has WhatsApp Reminders on, or null. */
  findRecipient(userId: string): Promise<{ phoneCiphertext: string } | null>;
  hasDelivery(userId: string, reminderId: string): Promise<boolean>;
  countSentSince(userId: string, since: string): Promise<number>;
  createDelivery(input: {
    userId: string;
    reminderId: string;
    status: "queued" | DeliveryOutcome["status"];
    providerMessageId: string | null;
    failureCode: string | null;
    attemptedAt: string | null;
  }): Promise<void>;
  /** Queued deliveries of every User, oldest first. */
  listQueued(limit: number): Promise<{ id: string; userId: string; reminderId: string }[]>;
  /** Settles a queued delivery. False when another dispatch settled it first. */
  settleQueued(input: {
    id: string;
    userId: string;
    outcome: DeliveryOutcome;
    attemptedAt: string;
  }): Promise<boolean>;
}

export type SendBudgetAlert = (input: {
  to: string;
  bodyParameters: string[];
}) => Promise<{ messageId: string }>;

export type BudgetAlertService = ReturnType<typeof createBudgetAlertService>;

export function createBudgetAlertService(input: {
  repository: BudgetAlertRepository;
  describe: (userId: string, reminderId: string) => Promise<BudgetAlertDetails | null>;
  /** Missing when Kapso is not configured: nothing is sent or recorded. */
  send: SendBudgetAlert | undefined;
  secret: string | undefined;
  now?: () => Date;
}) {
  const { repository, describe } = input;
  const now = input.now ?? (() => new Date());
  const secret = input.secret?.trim();
  const { send } = input;

  async function attempt(
    userId: string,
    reminderId: string,
    phoneCiphertext: string,
    at: Date,
  ): Promise<DeliveryOutcome> {
    const sentToday = await repository.countSentSince(userId, startOfLocalDay(at).toISOString());
    if (sentToday >= WHATSAPP_DAILY_LIMIT) return skipped("daily_limit");
    const details = await describe(userId, reminderId);
    if (!details) return skipped("reminder_gone");
    const to = secret ? await decryptPhone(phoneCiphertext, secret) : null;
    if (!to || !send) return failed("recipient_unavailable");
    try {
      const { messageId } = await send({ to, bodyParameters: budgetAlertParameters(details) });
      return { status: "sent", providerMessageId: messageId, failureCode: null };
    } catch {
      // The provider's error can echo the number, so only a code is kept.
      return failed("send_failed");
    }
  }

  return {
    /** Sends or queues the alert for one new Reminder. Safe to call more than once. */
    async deliver(
      userId: string,
      reminderId: string,
    ): Promise<DeliveryOutcome["status"] | "queued" | null> {
      if (!secret || !send) return null;
      if (await repository.hasDelivery(userId, reminderId)) return null;
      const recipient = await repository.findRecipient(userId);
      if (!recipient) return null;
      const at = now();
      if (isQuietHour(at)) {
        await repository.createDelivery({
          userId,
          reminderId,
          status: "queued",
          providerMessageId: null,
          failureCode: null,
          attemptedAt: null,
        });
        return "queued";
      }
      const outcome = await attempt(userId, reminderId, recipient.phoneCiphertext, at);
      await repository.createDelivery({
        userId,
        reminderId,
        ...outcome,
        attemptedAt: at.toISOString(),
      });
      return outcome.status;
    },

    /** Sends alerts held back by quiet hours. Run on a schedule; returns how many were settled. */
    async dispatchQueued(): Promise<number> {
      if (!secret || !send) return 0;
      const at = now();
      if (isQuietHour(at)) return 0;
      let settled = 0;
      for (const queued of await repository.listQueued(DISPATCH_BATCH)) {
        const recipient = await repository.findRecipient(queued.userId);
        const outcome = recipient
          ? await attempt(queued.userId, queued.reminderId, recipient.phoneCiphertext, at)
          : skipped("not_linked");
        const won = await repository.settleQueued({
          id: queued.id,
          userId: queued.userId,
          outcome,
          attemptedAt: at.toISOString(),
        });
        if (won) settled++;
      }
      return settled;
    },
  };
}

const skipped = (failureCode: string): DeliveryOutcome => ({
  status: "skipped",
  providerMessageId: null,
  failureCode,
});
const failed = (failureCode: string): DeliveryOutcome => ({
  status: "failed",
  providerMessageId: null,
  failureCode,
});

function isQuietHour(at: Date): boolean {
  const hour = new Date(at.getTime() + UTC_OFFSET_MS).getUTCHours();
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

function startOfLocalDay(at: Date): Date {
  const local = new Date(at.getTime() + UTC_OFFSET_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - UTC_OFFSET_MS,
  );
}

function rupiah(amountMinor: string): string {
  return `Rp ${amountMinor.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/**
 * Fills budget_alert: "Heads up: you have used {{1}}% of your {{2}} budget
 * ({{3}} of {{4}}). {{5}} is left until {{6}}."
 */
export function budgetAlertParameters(details: BudgetAlertDetails): string[] {
  const used = BigInt(details.used.amountMinor);
  const limit = BigInt(details.limit.amountMinor);
  const percent = limit > 0n ? (used * 100n) / limit : 100n;
  const left = limit > used ? limit - used : 0n;
  const endsOn = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${details.periodEndsOn}T00:00:00Z`));
  return [
    percent.toString(),
    details.budgetName,
    rupiah(used.toString()),
    rupiah(limit.toString()),
    rupiah(left.toString()),
    endsOn,
  ];
}
