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
const CLAIM_TTL_MS = 5 * 60 * 1000;

export const BUDGET_ALERT_TEMPLATE = "budget_alert";

type DeliveryOutcome =
  | { status: "sent"; providerMessageId: string; failureCode: null }
  | { status: "skipped" | "failed"; providerMessageId: null; failureCode: string };

/**
 * One reminder_deliveries row per Reminder. It is reserved as `queued` before
 * anything is sent, claimed by setting its attempt time, then settled once.
 */
export interface BudgetAlertRepository {
  /** The sealed number of a verified link whose User has WhatsApp Reminders on, or null. */
  findRecipient(userId: string): Promise<{ phoneCiphertext: string } | null>;
  /** Reserves the Reminder's only delivery row, or returns its existing row. */
  reserve(input: { userId: string; reminderId: string }): Promise<string | null>;
  /** Claims an unattempted row or safely reclaims a stale pre-provider claim. */
  claim(input: {
    id: string;
    userId: string;
    attemptedAt: string;
    reclaimBefore: string;
  }): Promise<boolean>;
  /** Releases this exact claim after a failure that happened before any provider call. */
  releaseClaim(input: { id: string; userId: string; attemptedAt: string }): Promise<void>;
  /** Marks the provider boundary. False unless this caller still owns the queued claim. */
  markSending(input: { id: string; userId: string; attemptedAt: string }): Promise<boolean>;
  /** Fails stale provider-started rows; an unknown provider outcome must never be resent. */
  abandonStaleSending(before: string): Promise<number>;
  /** Rows attempted since `since` that were sent or are still being sent. */
  countAttemptedSince(userId: string, since: string): Promise<number>;
  /** Records how a claimed row ended. */
  settle(input: { id: string; userId: string; outcome: DeliveryOutcome }): Promise<void>;
  /** Unclaimed or safely reclaimable pre-provider rows, oldest first. */
  listQueued(
    limit: number,
    reclaimBefore: string,
  ): Promise<{ id: string; userId: string; reminderId: string }[]>;
}

/** Sends the budget_alert template to an E.164 number with its values in order. */
export type SendBudgetAlert = (input: {
  to: string;
  bodyParameters: string[];
}) => Promise<{ messageId: string }>;

export type BudgetAlertService = ReturnType<typeof createBudgetAlertService>;

/** Builds the service that sends, queues and dispatches WhatsApp budget alerts. */
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

  /** Claims a reserved row, then sends unless the cap or the Reminder says otherwise. */
  async function attemptReserved(
    row: { id: string; userId: string; reminderId: string },
    phoneCiphertext: string,
    at: Date,
  ): Promise<DeliveryOutcome["status"] | null> {
    const attemptedAt = at.toISOString();
    const reclaimBefore = new Date(at.getTime() - CLAIM_TTL_MS).toISOString();
    if (
      !(await repository.claim({
        id: row.id,
        userId: row.userId,
        attemptedAt,
        reclaimBefore,
      }))
    ) {
      return null;
    }
    let providerStarted = false;
    try {
      // The count includes this claim and any other in flight, so racing sends
      // can only fall short of the limit, never pass it.
      const attempted = await repository.countAttemptedSince(
        row.userId,
        startOfLocalDay(at).toISOString(),
      );
      let outcome: DeliveryOutcome;
      if (attempted > WHATSAPP_DAILY_LIMIT) {
        outcome = skipped("daily_limit");
      } else {
        const details = await describe(row.userId, row.reminderId);
        const to = secret ? await decryptPhone(phoneCiphertext, secret) : null;
        if (!details) outcome = skipped("reminder_gone");
        else if (!to || !send) outcome = failed("recipient_unavailable");
        else {
          if (!(await repository.markSending({ ...row, attemptedAt }))) return null;
          providerStarted = true;
          try {
            const { messageId } = await send({
              to,
              bodyParameters: budgetAlertParameters(details),
            });
            outcome = { status: "sent", providerMessageId: messageId, failureCode: null };
          } catch {
            // The provider's error can echo the number, so only a code is kept.
            outcome = failed("send_failed");
          }
        }
      }
      await repository.settle({ id: row.id, userId: row.userId, outcome });
      return outcome.status;
    } catch (error) {
      if (!providerStarted) {
        // Nothing reached Kapso, so the next dispatch can safely retry this row.
        await repository.releaseClaim({ id: row.id, userId: row.userId, attemptedAt });
      }
      throw error;
    }
  }

  return {
    /** Sends or queues the alert for one new Reminder. Safe to call more than once. */
    async deliver(
      userId: string,
      reminderId: string,
    ): Promise<DeliveryOutcome["status"] | "queued" | null> {
      if (!secret || !send) return null;
      const recipient = await repository.findRecipient(userId);
      if (!recipient) return null;
      const id = await repository.reserve({ userId, reminderId });
      if (!id) return null;
      const at = now();
      if (isQuietHour(at)) return "queued";
      return attemptReserved({ id, userId, reminderId }, recipient.phoneCiphertext, at);
    },

    /** Sends alerts held back by quiet hours. Run on a schedule; returns how many were settled. */
    async dispatchQueued(): Promise<number> {
      if (!secret || !send) return 0;
      const at = now();
      if (isQuietHour(at)) return 0;
      const reclaimBefore = new Date(at.getTime() - CLAIM_TTL_MS).toISOString();
      await repository.abandonStaleSending(reclaimBefore);
      let settled = 0;
      for (const row of await repository.listQueued(DISPATCH_BATCH, reclaimBefore)) {
        try {
          const recipient = await repository.findRecipient(row.userId);
          if (!recipient) {
            if (
              await repository.claim({
                ...row,
                attemptedAt: at.toISOString(),
                reclaimBefore,
              })
            ) {
              await repository.settle({ ...row, outcome: skipped("not_linked") });
              settled++;
            }
            continue;
          }
          if (await attemptReserved(row, recipient.phoneCiphertext, at)) settled++;
        } catch {
          // One unavailable row must not block later alerts in the batch.
        }
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

/** True between 22:00 and 07:00 in the User's timezone. */
function isQuietHour(at: Date): boolean {
  const hour = new Date(at.getTime() + UTC_OFFSET_MS).getUTCHours();
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/** Midnight of `at`'s day in the User's timezone, as a UTC instant. */
function startOfLocalDay(at: Date): Date {
  const local = new Date(at.getTime() + UTC_OFFSET_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - UTC_OFFSET_MS,
  );
}

/** A whole-rupiah amount written as Rp 1.200.000. */
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
