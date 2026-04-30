import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import type {
  JobHandler,
  QueueDriver,
  WorkerStartOptions,
} from "../../core/ports/QueueDriver.js";
import type { BullMqQueueOptions } from "../../types/index.js";

const DEFAULT_NAME = "webhook-deliveries";

export class BullMqQueueDriver implements QueueDriver {
  private readonly connection: InstanceType<typeof Redis>;
  private readonly queue: Queue;
  private workers: Worker[] = [];
  private readonly queueName: string;
  private readonly workerConcurrency: number;
  private readonly defaultWorkerCount: number;

  constructor(private readonly options: BullMqQueueOptions) {
    this.queueName = options.queueName ?? DEFAULT_NAME;
    this.workerConcurrency = Math.max(
      1,
      Math.trunc(options.workerConcurrency ?? 8),
    );
    this.defaultWorkerCount = Math.max(1, Math.trunc(options.workerCount ?? 1));
    this.connection =
      typeof options.connection === "string"
        ? new Redis(options.connection)
        : new Redis(options.connection);
    this.queue = new Queue(this.queueName, { connection: this.connection });
  }

  async enqueue(jobId: string, delayMs = 0): Promise<void> {
    await this.queue.add(
      "deliver",
      { jobId },
      {
        delay: delayMs,
        removeOnComplete: true,
        attempts: 1,
      },
    );
  }

  async startWorker(
    handler: JobHandler,
    options?: WorkerStartOptions,
  ): Promise<void> {
    if (this.workers.length > 0) return;
    const requested = options?.workerCount ?? this.defaultWorkerCount;
    const workerCount = Math.max(1, Math.trunc(requested));
    const nextWorkers: Worker[] = [];
    for (let index = 0; index < workerCount; index += 1) {
      const conn = this.connection.duplicate();
      const worker = new Worker(
        this.queueName,
        async (job) => {
          const id = (job.data as { jobId: string }).jobId;
          await handler(id);
        },
        { connection: conn, concurrency: this.workerConcurrency },
      );
      nextWorkers.push(worker);
    }
    this.workers = nextWorkers;
  }

  async stopWorker(): Promise<void> {
    if (this.workers.length > 0) {
      await Promise.all(this.workers.map((worker) => worker.close()));
      this.workers = [];
    }
    await this.queue.close();
    await this.connection.quit();
  }

  async recoverPending(listJobIds: () => Promise<string[]>): Promise<void> {
    const ids = await listJobIds();
    if (ids.length === 0) return;
    await this.queue.addBulk(
      ids.map((jobId) => ({
        name: "deliver",
        data: { jobId },
        opts: { removeOnComplete: true, attempts: 1 },
      })),
    );
  }
}
