import type { WebhookJob } from '../entities/WebhookJob.js';
import type { JobRepository } from '../ports/JobRepository.js';
import type { QueueDriver } from '../ports/QueueDriver.js';
import type { WebhookHttpClient } from '../ports/WebhookHttpClient.js';
import { computeBackoffMs } from '../utils/backoff.js';

export class DeliveryService {
  private static readonly LEASE_MS = 30_000;
  private readonly workerId = `worker-${Math.random().toString(36).slice(2)}`;

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

    const now = new Date();
    if (job.nextAttemptAt && job.nextAttemptAt > now) {
      const delay = job.nextAttemptAt.getTime() - now.getTime();
      await this.queue.enqueue(jobId, Math.max(0, delay));
      return;
    }

    const claimed = await this.jobs.claimPending(
      jobId,
      now,
      this.workerId,
      DeliveryService.LEASE_MS,
    );
    if (!claimed) return;
    const processing: WebhookJob = {
      ...job,
      status: 'processing',
      updatedAt: now,
      leaseOwner: this.workerId,
      leaseExpiresAt: new Date(now.getTime() + DeliveryService.LEASE_MS),
      processingStartedAt: job.processingStartedAt ?? now,
    };

    const renewEveryMs = Math.max(2_000, Math.floor(DeliveryService.LEASE_MS / 3));
    const leaseTimer = setInterval(() => {
      void this.jobs.renewLease(
        jobId,
        this.workerId,
        new Date(),
        DeliveryService.LEASE_MS,
      );
    }, renewEveryMs);

    let result: { ok: boolean; status: number; errorMessage?: string };
    try {
      result = await this.http.deliver({
        url: processing.subscriberUrl,
        event: processing.event,
        payload: processing.payload,
        idempotencyKey: processing.idempotencyKey,
        timeoutMs: this.httpTimeoutMs,
      });
    } finally {
      clearInterval(leaseTimer);
    }

    const after = new Date();

    if (result.ok) {
      await this.jobs.save({
        ...processing,
        status: 'delivered',
        attempts: processing.attempts + 1,
        updatedAt: after,
        lastError: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        processingStartedAt: null,
      });
      await this.jobs.releaseLease(jobId, this.workerId);
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
        leaseOwner: null,
        leaseExpiresAt: null,
        processingStartedAt: null,
      });
      await this.jobs.releaseLease(jobId, this.workerId);
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
      leaseOwner: null,
      leaseExpiresAt: null,
      processingStartedAt: null,
    });
    await this.jobs.releaseLease(jobId, this.workerId);
    await this.queue.enqueue(jobId, delayMs);
  }
}
