import type { JobRepository } from '../core/ports/JobRepository.js';
import type { QueueDriver } from '../core/ports/QueueDriver.js';
import { DeliveryService } from '../core/services/DeliveryService.js';
import { WebhookService } from '../core/services/WebhookService.js';
import { SqliteClient } from '../infrastructure/db/sqlite/SqliteClient.js';
import { SqliteJobRepository } from '../infrastructure/db/sqlite/SqliteJobRepository.js';
import { SqliteSubscriberRepository } from '../infrastructure/db/sqlite/SqliteSubscriberRepository.js';
import { HttpClient } from '../infrastructure/http/HttpClient.js';
import { BullMqQueueDriver } from '../infrastructure/queue/BullMqQueueDriver.js';
import { InMemoryQueue } from '../infrastructure/queue/InMemoryQueue.js';
import type { CreateWebhooksOptions } from '../types/index.js';

export interface WebhookContainer {
  sqlite: SqliteClient;
  queue: QueueDriver;
  jobs: JobRepository;
  webhooks: WebhookService;
  delivery: DeliveryService;
}

export async function buildContainer(options: CreateWebhooksOptions): Promise<WebhookContainer> {
  const sqlite = await SqliteClient.open(options.sqlitePath);
  const jobs = new SqliteJobRepository(sqlite);
  const subscribers = new SqliteSubscriberRepository(sqlite);
  const http = new HttpClient();
  const maxDeliveryAttempts = options.maxDeliveryAttempts ?? 8;
  const httpTimeoutMs = options.httpTimeoutMs ?? 15_000;

  const queue: QueueDriver =
    options.queue.type === 'memory'
      ? new InMemoryQueue(options.queue.options)
      : new BullMqQueueDriver(options.queue.options);

  const delivery = new DeliveryService(jobs, http, queue, httpTimeoutMs);
  const webhooks = new WebhookService(subscribers, jobs, queue, maxDeliveryAttempts);

  return { sqlite, queue, jobs, webhooks, delivery };
}
