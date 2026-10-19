import type { AgentChatTurn, WhatsAppMessage } from "@monara/contracts";
import type { KapsoInboundMedia } from "@monara/integrations";
import type { Respond } from "../conversation/respond.ts";

/** One inbound message from a verified WhatsApp Link, plus where the reply goes. */
export interface QueuedMessage extends Omit<WhatsAppMessage, "text"> {
  /** Kapso message kind, used to select photo or audio extraction. */
  type: string;
  /** Empty for a photo sent without a caption. */
  text: string;
  /** A receipt photo stored by Kapso. Only its link is kept, never the bytes. */
  media?: KapsoInboundMedia | null;
  /** The User's number, digits only. Held only until the reply is sent. */
  to: string;
  phoneNumberId: string;
}

/** Reads a receipt photo or voice note, saves it as pending, and returns the reply. */
export type ReadMedia = (message: QueuedMessage) => Promise<string>;

/** What a photo turn looks like in the history the Agent sees next. */
const PHOTO_TURN = "[Sent a receipt photo]";
const VOICE_TURN = "[Sent a voice note]";

interface Outbound {
  to: string;
  phoneNumberId: string;
  text: string;
}

/** Everything `drain` owns. `receive` never writes it, so the two cannot overwrite each other. */
interface SessionState {
  /** Older outboxes without an owner cannot safely be delivered after upgrade. */
  userId?: string;
  /** The message the Agent is working on. Still set after a crash, never run twice. */
  inFlight: QueuedMessage | null;
  outbox: Outbound[];
  history: AgentChatTurn[];
  lastActiveAt: number;
}

/** The part of Durable Object storage a session uses. */
export interface SessionStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  /** Entries whose key starts with `prefix`, in key order. */
  list<T>(options: { prefix: string }): Promise<Map<string, T>>;
  deleteAll(): Promise<void>;
  setAlarm(scheduledTime: number): Promise<void>;
}

const STATE_KEY = "state";
// One key per queued message, so a message arriving mid-reply is added, never merged.
const INBOX_PREFIX = "inbox:";
// One key per message id already taken, so a redelivered webhook is not answered twice.
const SEEN_PREFIX = "seen:";
// 20 exchanges is plenty for follow-up questions, corrections, and undo.
const MAX_HISTORY_TURNS = 40;
/** A conversation is forgotten after this long without a message. */
export const IDLE_MS = 30 * 60 * 1000;

export const RECEIPT_FAILURE_REPLY =
  "Sorry, I couldn't read that photo and can't confirm anything was saved. Check your Review Queue in the app, or type it instead.";

export const FAILURE_REPLY =
  "Sorry, something went wrong and I can't confirm what was saved. Please check the app before sending that again.";

const emptyState = (): SessionState => ({
  inFlight: null,
  outbox: [],
  history: [],
  lastActiveAt: 0,
});

// Keeps messages that arrive in the same millisecond in arrival order.
let sequence = 0;

/**
 * One User's WhatsApp conversation. It answers messages one at a time and in
 * order, remembers recent turns so follow-ups work, and forgets them when the
 * conversation goes quiet.
 *
 * The Agent runs at most once per message: a message leaves the inbox before
 * the Agent starts, so a crash or a failed send can never record a
 * transaction twice. Only sending the reply is retried.
 *
 * `receive` can run while `drain` is waiting on the model or on Kapso. They
 * write different keys, so neither can lose the other's work.
 */
export class ConversationSession {
  private readonly storage: SessionStorage;
  private readonly respond: Respond;
  private readonly readMedia: ReadMedia | null;
  private readonly send: (message: Outbound) => Promise<void>;
  private readonly now: () => number;
  private readonly isActive: (userId: string) => Promise<boolean>;

  constructor(dependencies: {
    storage: SessionStorage;
    respond: Respond;
    readMedia?: ReadMedia;
    send: (message: Outbound) => Promise<void>;
    now: () => number;
    isActive: (userId: string) => Promise<boolean>;
  }) {
    this.storage = dependencies.storage;
    this.respond = dependencies.respond;
    this.readMedia = dependencies.readMedia ?? null;
    this.send = dependencies.send;
    this.now = dependencies.now;
    this.isActive = dependencies.isActive;
  }

  /** Queues a message and returns at once, so the webhook can answer Kapso in time. */
  async receive(message: QueuedMessage): Promise<void> {
    if (!(await this.isActive(message.userId))) return;
    const seenKey = `${SEEN_PREFIX}${message.messageId}`;
    if (await this.storage.get(seenKey)) return;
    sequence = (sequence + 1) % 1_000_000;
    const order = `${String(this.now()).padStart(15, "0")}:${String(sequence).padStart(6, "0")}`;
    await this.storage.put(seenKey, true);
    await this.storage.put(`${INBOX_PREFIX}${order}`, message);
    await this.storage.setAlarm(this.now());
  }

  /** Takes the oldest queued message out of the inbox and marks it as being worked on. */
  private async takeNext(state: SessionState): Promise<QueuedMessage | null> {
    const inbox = await this.storage.list<QueuedMessage>({ prefix: INBOX_PREFIX });
    const next = inbox.entries().next().value;
    if (!next) return null;
    const [key, message] = next;
    state.inFlight = message;
    state.userId = message.userId;
    // Saved before the inbox entry goes, so a crash in between cannot lose the message silently.
    await this.storage.put(STATE_KEY, state);
    await this.storage.delete(key);
    return message;
  }

  /** Works through the queue. A throw makes the runtime call this again later. */
  async drain(): Promise<void> {
    const state = (await this.storage.get<SessionState>(STATE_KEY)) ?? emptyState();

    if (state.inFlight) {
      state.userId ??= state.inFlight.userId;
      // The last run stopped partway, so what it saved is unknown. Say so instead of redoing it.
      state.outbox.push({ ...state.inFlight, text: FAILURE_REPLY });
      state.inFlight = null;
      await this.storage.put(STATE_KEY, state);
    }

    for (;;) {
      for (let next = state.outbox[0]; next; next = state.outbox[0]) {
        if (!state.userId || !(await this.isActive(state.userId))) {
          await this.storage.deleteAll();
          return;
        }
        await this.send(next);
        state.outbox.shift();
        await this.storage.put(STATE_KEY, state);
      }

      if (this.now() - state.lastActiveAt > IDLE_MS) state.history = [];
      const message = await this.takeNext(state);
      if (!message) break;
      if (!(await this.isActive(message.userId))) {
        await this.storage.deleteAll();
        return;
      }

      let text = FAILURE_REPLY;
      if (message.media) {
        try {
          if (!this.readMedia) throw new Error("Media reading is not configured.");
          text = await this.readMedia(message);
        } catch {
          text =
            message.type === "audio"
              ? "Sorry, I couldn't read that voice note and can't confirm anything was saved. Check your Review Queue or type it instead."
              : RECEIPT_FAILURE_REPLY;
        }
        if (!(await this.isActive(message.userId))) {
          await this.storage.deleteAll();
          return;
        }
        // The reply goes into the history so "confirm" or "it was BCA" can follow it.
        state.history = [
          ...state.history,
          {
            role: "user" as const,
            text: `${message.type === "audio" ? VOICE_TURN : PHOTO_TURN}${message.text ? ` ${message.text}` : ""}`,
          },
          { role: "assistant" as const, text },
        ].slice(-MAX_HISTORY_TURNS);
        state.inFlight = null;
        state.outbox.push({ to: message.to, phoneNumberId: message.phoneNumberId, text });
        state.lastActiveAt = this.now();
        await this.storage.put(STATE_KEY, state);
        continue;
      }
      try {
        const response = await this.respond({
          caller: { userId: message.userId, channel: "whatsapp" },
          history: state.history,
          text: message.text,
        });
        text = response.reply;
        state.history = [
          ...state.history,
          { role: "user" as const, text: message.text },
          {
            role: "assistant" as const,
            text: response.reply,
            ...(response.actions.length > 0 ? { actions: response.actions } : {}),
            ...(response.confirmation ? { confirmation: response.confirmation } : {}),
          },
        ].slice(-MAX_HISTORY_TURNS);
      } catch {
        // The Agent may have changed something before it failed, so the turn is not replayed.
      }
      if (!(await this.isActive(message.userId))) {
        await this.storage.deleteAll();
        return;
      }
      state.inFlight = null;
      state.outbox.push({ to: message.to, phoneNumberId: message.phoneNumberId, text });
      state.lastActiveAt = this.now();
      await this.storage.put(STATE_KEY, state);
    }

    // The inbox was empty a moment ago. A message arriving from here on sets its own alarm.
    if (this.now() - state.lastActiveAt >= IDLE_MS) {
      await this.storage.deleteAll();
    } else {
      await this.storage.setAlarm(state.lastActiveAt + IDLE_MS);
    }
  }
}
