import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { JobHandler, QueueDriver } from '../../core/ports/QueueDriver.js';
import type { BullMqQueueOptions } from '../../types/index.js';

const DEFAULT_NAME = 'webhook-deliveries';

export class BullMqQueueDriver implements QueueDriver {
  private readonly connection: InstanceType<typeof Redis>;
  private readonly queue: Queue;
  private worker: Worker | null = null;
  private readonly queueName: string;

  constructor(private readonly options: BullMqQueueOptions) {
    this.queueName = options.queueName ?? DEFAULT_NAME;
    this.connection =
      typeof options.connection === 'string'
        ? new Redis(options.connection)
        : new Redis(options.connection);
    this.queue = new Queue(this.queueName, { connection: this.connection });
  }

  async enqueue(jobId: string, delayMs = 0): Promise<void> {
    await this.queue.add(
      'deliver',
      { jobId },
      {
        jobId,
        delay: delayMs,
        removeOnComplete: true,
        attempts: 1,
      },
    );
  }

  async startWorker(handler: JobHandler): Promise<void> {
    const conn = this.connection.duplicate();
    this.worker = new Worker(
      this.queueName,
      async (job) => {
        const id = (job.data as { jobId: string }).jobId;
        await handler(id);
      },
      { connection: conn, concurrency: 8 },
    );
  }

  async stopWorker(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }
    await this.queue.close();
    await this.connection.quit();
  }

  async recoverPending(listJobIds: () => Promise<string[]>): Promise<void> {
    const ids = await listJobIds();
    if (ids.length === 0) return;
    await this.queue.addBulk(
      ids.map((jobId) => ({
        name: 'deliver',
        data: { jobId },
        opts: { jobId, removeOnComplete: true, attempts: 1 },
      })),
    );
  }
}
