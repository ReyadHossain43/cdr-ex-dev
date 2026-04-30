import type { WebhookJob } from '../entities/WebhookJob.js';

export interface JobRepository {
  create(job: WebhookJob): Promise<void>;
  findById(id: string): Promise<WebhookJob | null>;
  claimPending(id: string, now: Date): Promise<boolean>;
  save(job: WebhookJob): Promise<void>;
  listRecoverableJobIds(limit?: number): Promise<string[]>;
  resetStaleProcessing(olderThanMs: number): Promise<number>;
}
