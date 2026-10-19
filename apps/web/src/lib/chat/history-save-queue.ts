import type { ChatHistorySaveStatus } from "@monara/contracts";
import { retryChatHistorySave } from "./client.ts";

type PendingSave = Extract<ChatHistorySaveStatus, { status: "pending" }>;

/** Memory only. A failed or interrupted history save remains until its exact id is acknowledged. */
export class ChatHistorySaveQueue {
  private pending = new Map<string, PendingSave>();

  get count(): number {
    return this.pending.size;
  }

  remember(status: ChatHistorySaveStatus): void {
    if (status.status === "saved") this.pending.delete(status.exchangeId);
    else this.pending.set(status.exchangeId, status);
  }

  async flush(save = retryChatHistorySave): Promise<void> {
    // Independent keyed saves can run together. Each stays pending until its own
    // acknowledgment, so one failure cannot discard the others.
    const batch = [...this.pending.values()];
    const attempts = await Promise.allSettled(
      batch.map(async (next) => {
        const saved = await save(next);
        if (saved.status !== "saved" || saved.exchangeId !== next.exchangeId)
          throw new Error("The history save couldn’t be verified. Your reply is still here.");
        this.pending.delete(next.exchangeId);
      }),
    );
    const failure = attempts.find((attempt) => attempt.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    // Include replies that arrived while that batch was in flight. Promise
    // chaining yields between batches and keeps the final acknowledgment current.
    if (this.pending.size > 0) return this.flush(save);
  }
}
