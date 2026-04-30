import type { RedisOptions } from "ioredis";

export type WebhookJobStatus =
  | "pending"
  | "processing"
  | "delivered"
  | "failed";

export interface MemoryQueueOptions {
  concurrency?: number;
  pollIntervalMs?: number;
  workerCount?: number;
}

export interface BullMqQueueOptions {
  connection: RedisOptions | string;
  queueName?: string;
  workerConcurrency?: number;
  workerCount?: number;
}

export interface CreateWebhooksOptions {
  sqlitePath: string;
  maxDeliveryAttempts?: number;
  deliveryWorkers?: number;
  queue:
    | { type: "memory"; options?: MemoryQueueOptions }
    | { type: "bullmq"; options: BullMqQueueOptions };
  httpTimeoutMs?: number;
}

export interface WebhooksApi {
  register(event: string, url: string): Promise<void>;
  emit<T = unknown>(event: string, payload: T): Promise<void>;
  close(): Promise<void>;
}
