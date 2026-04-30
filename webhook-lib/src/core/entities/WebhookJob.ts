import type { WebhookJobStatus } from '../../types/index.js';

export interface WebhookJob {
  id: string;
  idempotencyKey: string;
  event: string;
  subscriberUrl: string;
  payload: unknown;
  status: WebhookJobStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastError: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  processingStartedAt: Date | null;
}

export function createPendingJob(input: {
  id: string;
  idempotencyKey: string;
  event: string;
  subscriberUrl: string;
  payload: unknown;
  maxAttempts: number;
  now: Date;
}): WebhookJob {
  return {
    id: input.id,
    idempotencyKey: input.idempotencyKey,
    event: input.event,
    subscriberUrl: input.subscriberUrl,
    payload: input.payload,
    status: 'pending',
    attempts: 0,
    maxAttempts: input.maxAttempts,
    nextAttemptAt: null,
    createdAt: input.now,
    updatedAt: input.now,
    lastError: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    processingStartedAt: null,
  };
}
