import type { WebhookJob } from '../entities/WebhookJob.js';

export interface JobRepository {
  create(job: WebhookJob): Promise<void>;
  findById(id: string): Promise<WebhookJob | null>;
  claimPending(id: string, now: Date, leaseOwner: string, leaseMs: number): Promise<boolean>;
  renewLease(id: string, leaseOwner: string, now: Date, leaseMs: number): Promise<boolean>;
  releaseLease(id: string, leaseOwner: string): Promise<boolean>;
  save(job: WebhookJob): Promise<void>;
  listRecoverableJobIds(limit?: number): Promise<string[]>;
  resetStaleProcessing(olderThanMs: number): Promise<number>;
}
