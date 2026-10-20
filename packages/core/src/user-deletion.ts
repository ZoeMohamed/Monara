/** A leased cleanup step. No email bodies, phone numbers, or financial data. */
interface UserDeletionJob {
  userId: string;
  leaseToken: string;
  connectedAccountIds: string[];
  triggerIds: string[];
  whatsappPurged: boolean;
}

export interface UserDeletionRepository {
  claim(userId?: string): Promise<UserDeletionJob | null>;
  /** Removes the lease and checkpoints only while the caller still owns it. */
  checkpoint(job: UserDeletionJob, retry: boolean): Promise<void>;
  /** Hard-deletes Auth only after every required external cleanup has succeeded. */
  deleteIdentity(job: UserDeletionJob): Promise<void>;
}

/**
 * Each leased step is repeatable. A provider failure leaves its target intact;
 * a process crash expires the lease. A missing resource counts as removed in
 * the provider adapter, never by swallowing arbitrary failures here.
 */
export function createUserDeletionService(deps: {
  repository: UserDeletionRepository;
  purgeWhatsApp: (userId: string) => Promise<void>;
  removeTrigger: (id: string) => Promise<void>;
  revokeConnection: (id: string) => Promise<void>;
  /** Returns true only when the User has no remaining upstream resources. */
  cleanProviderUser: (userId: string) => Promise<boolean>;
  /** Removes an owned Storage batch; true requires an empty inventory. */
  cleanStorageUser: (userId: string) => Promise<boolean>;
}) {
  return {
    async processNext(userId?: string): Promise<"idle" | "progress" | "retry" | "complete"> {
      const job = await deps.repository.claim(userId);
      if (!job) return "idle";
      try {
        if (!job.whatsappPurged) {
          await deps.purgeWhatsApp(job.userId);
          job.whatsappPurged = true;
        } else if (job.triggerIds.length > 0) {
          await deps.removeTrigger(job.triggerIds[0]);
          job.triggerIds.shift();
        } else if (job.connectedAccountIds.length > 0) {
          await deps.revokeConnection(job.connectedAccountIds[0]);
          job.connectedAccountIds.shift();
        } else {
          if (!(await deps.cleanStorageUser(job.userId))) {
            await deps.repository.checkpoint(job, false);
            return "progress";
          }
          if (!(await deps.cleanProviderUser(job.userId))) {
            await deps.repository.checkpoint(job, false);
            return "progress";
          }
          await deps.repository.deleteIdentity(job);
          return "complete";
        }
        await deps.repository.checkpoint(job, false);
        return "progress";
      } catch {
        await deps.repository.checkpoint(job, true);
        return "retry";
      }
    },
  };
}
