import type { WebhookJob } from '../../../core/entities/WebhookJob.js';
import type { JobRepository } from '../../../core/ports/JobRepository.js';

export class PgJobRepository implements JobRepository {
  async create(_job: WebhookJob): Promise<void> {
    throw new Error('PgJobRepository is not implemented yet.');
  }

  async findById(_id: string): Promise<WebhookJob | null> {
    throw new Error('PgJobRepository is not implemented yet.');
  }

  async claimPending(_id: string, _now: Date): Promise<boolean> {
    throw new Error('PgJobRepository is not implemented yet.');
  }

  async save(_job: WebhookJob): Promise<void> {
    throw new Error('PgJobRepository is not implemented yet.');
  }

  async archiveCompleted(_id: string): Promise<void> {
    throw new Error('PgJobRepository is not implemented yet.');
  }

  async listRecoverableJobIds(_limit?: number): Promise<string[]> {
    throw new Error('PgJobRepository is not implemented yet.');
  }

  async resetStaleProcessing(_olderThanMs: number): Promise<number> {
    throw new Error('PgJobRepository is not implemented yet.');
  }
}
