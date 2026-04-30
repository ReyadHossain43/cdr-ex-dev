import { randomUUID } from "node:crypto";
import { createPendingJob } from "../entities/WebhookJob.js";
import type { JobRepository } from "../ports/JobRepository.js";
import type { QueueDriver } from "../ports/QueueDriver.js";
import type { SubscriberRepository } from "../ports/SubscriberRepository.js";

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
    const now = new Date();
    const seenUrls = new Set<string>();
    let batch: { id: string; job: ReturnType<typeof createPendingJob> }[] = [];

    const flushBatch = async (): Promise<void> => {
      if (batch.length === 0) return;
      const insertResults = await Promise.allSettled(
        batch.map(({ job }) => this.jobs.create(job)),
      );
      const enqueuePromises: Promise<void>[] = [];

      for (
        let resultIndex = 0;
        resultIndex < insertResults.length;
        resultIndex += 1
      ) {
        if (insertResults[resultIndex]?.status !== "fulfilled") continue;
        enqueuePromises.push(this.queue.enqueue(batch[resultIndex].id));
      }

      if (enqueuePromises.length > 0) {
        await Promise.all(enqueuePromises);
      }

      batch = [];
    };

    for await (const sub of this.subscribers.streamByEvent(event)) {
      if (seenUrls.has(sub.url)) continue;
      seenUrls.add(sub.url);

      const id = randomUUID();
      batch.push({
        id,
        job: createPendingJob({
          id,
          event,
          subscriberUrl: sub.url,
          payload,
          maxAttempts: this.maxDeliveryAttempts,
          now,
        }),
      });

      if (batch.length >= ENQUEUE_BATCH_SIZE) {
        await flushBatch();
      }
    }

    await flushBatch();
  }
}
