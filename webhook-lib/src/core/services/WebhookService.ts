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

    const now = new Date();
    const jobs = uniqueSubs.map((sub) => {
      const id = randomUUID();
      return {
        id,
        job: createPendingJob({
          id,
          event,
          subscriberUrl: sub.url,
          payload,
          maxAttempts: this.maxDeliveryAttempts,
          now,
        }),
      };
    });

    for (let index = 0; index < jobs.length; index += ENQUEUE_BATCH_SIZE) {
      const batch = jobs.slice(index, index + ENQUEUE_BATCH_SIZE);
      const insertResults = await Promise.allSettled(batch.map(({ job }) => this.jobs.create(job)));

      const enqueuePromises: Promise<void>[] = [];
      for (let resultIndex = 0; resultIndex < insertResults.length; resultIndex += 1) {
        if (insertResults[resultIndex]?.status !== 'fulfilled') continue;
        enqueuePromises.push(this.queue.enqueue(batch[resultIndex].id));
      }

      if (enqueuePromises.length > 0) {
        await Promise.all(enqueuePromises);
      }
    }
  }
}
