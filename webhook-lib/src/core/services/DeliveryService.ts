import type { WebhookJob } from '../entities/WebhookJob.js';
import type { JobRepository } from '../ports/JobRepository.js';
import type { QueueDriver } from '../ports/QueueDriver.js';
import type { WebhookHttpClient } from '../ports/WebhookHttpClient.js';
import { computeBackoffMs } from '../utils/backoff.js';

export class DeliveryService {
  constructor(
    private readonly jobs: JobRepository,
    private readonly http: WebhookHttpClient,
    private readonly queue: QueueDriver,
    private readonly httpTimeoutMs: number,
  ) {}

  async processJob(jobId: string): Promise<void> {
    const job = await this.jobs.findById(jobId);
    if (!job) return;
    if (job.status === 'delivered' || job.status === 'failed') return;
    if (job.status === 'processing') return;

    const now = new Date();
    if (job.nextAttemptAt && job.nextAttemptAt > now) {
      const delay = job.nextAttemptAt.getTime() - now.getTime();
      await this.queue.enqueue(jobId, Math.max(0, delay));
      return;
    }

    const claimed = await this.jobs.claimPending(jobId, now);
    if (!claimed) return;
    const processing: WebhookJob = { ...job, status: 'processing', updatedAt: now };

    const result = await this.http.deliver({
      url: processing.subscriberUrl,
      event: processing.event,
      payload: processing.payload,
      timeoutMs: this.httpTimeoutMs,
    });

    const after = new Date();

    if (result.ok) {
      await this.jobs.save({
        ...processing,
        status: 'delivered',
        attempts: processing.attempts + 1,
        updatedAt: after,
        lastError: null,
      });
      return;
    }

    const nextAttempts = processing.attempts + 1;
    const err = result.errorMessage ?? `HTTP ${result.status}`;

    if (nextAttempts >= processing.maxAttempts) {
      await this.jobs.save({
        ...processing,
        status: 'failed',
        attempts: nextAttempts,
        updatedAt: after,
        lastError: err,
        nextAttemptAt: null,
      });
      return;
    }

    const delayMs = computeBackoffMs(nextAttempts);
    await this.jobs.save({
      ...processing,
      status: 'pending',
      attempts: nextAttempts,
      updatedAt: after,
      lastError: err,
      nextAttemptAt: new Date(after.getTime() + delayMs),
    });
    await this.queue.enqueue(jobId, delayMs);
  }
}
