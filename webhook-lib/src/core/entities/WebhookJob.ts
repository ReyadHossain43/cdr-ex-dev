import type { WebhookJobStatus } from '../../types/index.js';

export interface WebhookJob {
  id: string;
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
}

export function createPendingJob(input: {
  id: string;
  event: string;
  subscriberUrl: string;
  payload: unknown;
  maxAttempts: number;
  now: Date;
}): WebhookJob {
  return {
    id: input.id,
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
  };
}
