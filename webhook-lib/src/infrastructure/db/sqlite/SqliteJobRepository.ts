import type { WebhookJob } from '../../../core/entities/WebhookJob.js';
import type { JobRepository } from '../../../core/ports/JobRepository.js';
import type { WebhookJobStatus } from '../../../types/index.js';
import type { SqliteClient } from './SqliteClient.js';

function rowToJob(row: {
  id: string;
  idempotency_key: string;
  event: string;
  subscriber_url: string;
  payload_json: string;
  status: string;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string | null;
  created_at: string;
  updated_at: string;
  last_error: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  processing_started_at: string | null;
}): WebhookJob {
  return {
    id: String(row.id),
    idempotencyKey: String(row.idempotency_key),
    event: String(row.event),
    subscriberUrl: String(row.subscriber_url),
    payload: JSON.parse(String(row.payload_json)) as unknown,
    status: row.status as WebhookJobStatus,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    nextAttemptAt: row.next_attempt_at ? new Date(String(row.next_attempt_at)) : null,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
    lastError: row.last_error == null ? null : String(row.last_error),
    leaseOwner: row.lease_owner == null ? null : String(row.lease_owner),
    leaseExpiresAt: row.lease_expires_at ? new Date(String(row.lease_expires_at)) : null,
    processingStartedAt: row.processing_started_at
      ? new Date(String(row.processing_started_at))
      : null,
  };
}

export class SqliteJobRepository implements JobRepository {
  constructor(private readonly sqlite: SqliteClient) {}

  async create(job: WebhookJob): Promise<void> {
    this.sqlite.runMutating(
      `INSERT INTO webhook_jobs (
          id, idempotency_key, event, subscriber_url, payload_json, status, attempts, max_attempts,
          next_attempt_at, created_at, updated_at, last_error, lease_owner, lease_expires_at, processing_started_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        job.id,
        job.idempotencyKey,
        job.event,
        job.subscriberUrl,
        JSON.stringify(job.payload),
        job.status,
        job.attempts,
        job.maxAttempts,
        job.nextAttemptAt?.toISOString() ?? null,
        job.createdAt.toISOString(),
        job.updatedAt.toISOString(),
        job.lastError,
        job.leaseOwner,
        job.leaseExpiresAt?.toISOString() ?? null,
        job.processingStartedAt?.toISOString() ?? null,
      ],
    );
  }

  async findById(id: string): Promise<WebhookJob | null> {
    const row = this.sqlite.get<{
      id: string;
      idempotency_key: string;
      event: string;
      subscriber_url: string;
      payload_json: string;
      status: string;
      attempts: number;
      max_attempts: number;
      next_attempt_at: string | null;
      created_at: string;
      updated_at: string;
      last_error: string | null;
      lease_owner: string | null;
      lease_expires_at: string | null;
      processing_started_at: string | null;
    }>(
      `SELECT id, idempotency_key, event, subscriber_url, payload_json, status, attempts, max_attempts,
              next_attempt_at, created_at, updated_at, last_error, lease_owner, lease_expires_at, processing_started_at
       FROM webhook_jobs WHERE id = ?`,
      [id],
    );
    return row ? rowToJob(row) : null;
  }

  async claimPending(id: string, now: Date, leaseOwner: string, leaseMs: number): Promise<boolean> {
    const leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();
    const changed = this.sqlite.runMutating(
      `UPDATE webhook_jobs
         SET status = 'processing',
             updated_at = ?,
             lease_owner = ?,
             lease_expires_at = ?,
             processing_started_at = CASE
               WHEN status = 'processing' AND processing_started_at IS NOT NULL THEN processing_started_at
               ELSE ?
             END
         WHERE id = ?
           AND (
             (status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
             OR (status = 'processing' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
           )`,
      [now.toISOString(), leaseOwner, leaseExpiresAt, now.toISOString(), id, now.toISOString(), now.toISOString()],
    );
    return changed > 0;
  }

  async renewLease(id: string, leaseOwner: string, now: Date, leaseMs: number): Promise<boolean> {
    const leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();
    const changed = this.sqlite.runMutating(
      `UPDATE webhook_jobs
         SET lease_expires_at = ?, updated_at = ?
       WHERE id = ? AND status = 'processing' AND lease_owner = ?`,
      [leaseExpiresAt, now.toISOString(), id, leaseOwner],
    );
    return changed > 0;
  }

  async releaseLease(id: string, leaseOwner: string): Promise<boolean> {
    const changed = this.sqlite.runMutating(
      `UPDATE webhook_jobs
         SET lease_owner = NULL, lease_expires_at = NULL, processing_started_at = NULL
       WHERE id = ? AND lease_owner = ?`,
      [id, leaseOwner],
    );
    return changed > 0;
  }

  async save(job: WebhookJob): Promise<void> {
    this.sqlite.runMutating(
      `UPDATE webhook_jobs SET
          idempotency_key = ?, event = ?, subscriber_url = ?, payload_json = ?, status = ?, attempts = ?,
          max_attempts = ?, next_attempt_at = ?, updated_at = ?, last_error = ?, lease_owner = ?,
          lease_expires_at = ?, processing_started_at = ?
        WHERE id = ?`,
      [
        job.idempotencyKey,
        job.event,
        job.subscriberUrl,
        JSON.stringify(job.payload),
        job.status,
        job.attempts,
        job.maxAttempts,
        job.nextAttemptAt?.toISOString() ?? null,
        job.updatedAt.toISOString(),
        job.lastError,
        job.leaseOwner,
        job.leaseExpiresAt?.toISOString() ?? null,
        job.processingStartedAt?.toISOString() ?? null,
        job.id,
      ],
    );
  }

  async listRecoverableJobIds(limit = 1000): Promise<string[]> {
    const now = new Date().toISOString();
    const rows = this.sqlite.all<{ id: string }>(
      `SELECT id FROM webhook_jobs
         WHERE status = 'pending'
           AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
         ORDER BY created_at ASC
         LIMIT ?`,
      [now, limit],
    );
    return rows.map((r) => String(r.id));
  }

  async resetStaleProcessing(olderThanMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    return this.sqlite.runMutating(
      `UPDATE webhook_jobs
         SET status = 'pending',
             updated_at = ?,
             lease_owner = NULL,
             lease_expires_at = NULL
         WHERE status = 'processing' AND updated_at < ?`,
      [new Date().toISOString(), cutoff],
    );
  }
}
