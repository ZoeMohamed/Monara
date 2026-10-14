import type { AgentChatTurn, WhatsAppMessage } from "@monara/contracts";
import type { Respond } from "../conversation/respond.ts";

/** One inbound text from a verified WhatsApp Link, plus where the reply goes. */
export interface QueuedMessage extends WhatsAppMessage {
  /** The User's number, digits only. Held only until the reply is sent. */
  to: string;
  phoneNumberId: string;
}

interface Outbound {
  to: string;
  phoneNumberId: string;
  text: string;
}

/** Everything `drain` owns. `receive` never writes it, so the two cannot overwrite each other. */
interface SessionState {
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
  private readonly send: (message: Outbound) => Promise<void>;
  private readonly now: () => number;

  constructor(dependencies: {
    storage: SessionStorage;
    respond: Respond;
    send: (message: Outbound) => Promise<void>;
    now: () => number;
  }) {
    this.storage = dependencies.storage;
    this.respond = dependencies.respond;
    this.send = dependencies.send;
    this.now = dependencies.now;
  }

  /** Queues a message and returns at once, so the webhook can answer Kapso in time. */
  async receive(message: QueuedMessage): Promise<void> {
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
    // Saved before the inbox entry goes, so a crash in between cannot lose the message silently.
    await this.storage.put(STATE_KEY, state);
    await this.storage.delete(key);
    return message;
  }

  /** Works through the queue. A throw makes the runtime call this again later. */
  async drain(): Promise<void> {
    const state = (await this.storage.get<SessionState>(STATE_KEY)) ?? emptyState();

    if (state.inFlight) {
      // The last run stopped partway, so what it saved is unknown. Say so instead of redoing it.
      state.outbox.push({ ...state.inFlight, text: FAILURE_REPLY });
      state.inFlight = null;
      await this.storage.put(STATE_KEY, state);
    }

    for (;;) {
      for (let next = state.outbox[0]; next; next = state.outbox[0]) {
        await this.send(next);
        state.outbox.shift();
        await this.storage.put(STATE_KEY, state);
      }

      if (this.now() - state.lastActiveAt > IDLE_MS) state.history = [];
      const message = await this.takeNext(state);
      if (!message) break;

      let text = FAILURE_REPLY;
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
