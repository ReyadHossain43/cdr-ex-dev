import { randomUUID } from 'node:crypto';
import { createPendingJob } from '../entities/WebhookJob.js';
import type { JobRepository } from '../ports/JobRepository.js';
import type { QueueDriver } from '../ports/QueueDriver.js';
import type { SubscriberRepository } from '../ports/SubscriberRepository.js';

const ENQUEUE_BATCH_SIZE = 200;

export class WebhookService {
  constructor(
    private readonly subscribers: SubscriberRepository,
    private readonly jobs: JobRepository,
    private readonly queue: QueueDriver,
    private readonly maxDeliveryAttempts: number,
  ) {}

  async register(event: string, url: string): Promise<void> {
    await this.subscribers.add(event, url);
  }

  async emit<T = unknown>(event: string, payload: T): Promise<void> {
    const subs = await this.subscribers.listByEvent(event);
    if (subs.length === 0) return;
    const uniqueSubs = Array.from(new Map(subs.map((sub) => [sub.url, sub])).values());
    const deliveryId = randomUUID();

    const now = new Date();
    let enqueuePromises: Promise<void>[] = [];

    for (const sub of uniqueSubs) {
      const id = randomUUID();
      const job = createPendingJob({
        id,
        idempotencyKey: `${deliveryId}:${sub.url}`,
        event,
        subscriberUrl: sub.url,
        payload,
        maxAttempts: this.maxDeliveryAttempts,
        now,
      });
      await this.jobs.create(job);
      enqueuePromises.push(this.queue.enqueue(id));

      if (enqueuePromises.length >= ENQUEUE_BATCH_SIZE) {
        await Promise.all(enqueuePromises);
        enqueuePromises = [];
      }
    }

    if (enqueuePromises.length > 0) {
      await Promise.all(enqueuePromises);
    }
  }
}
