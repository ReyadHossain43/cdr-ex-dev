import type { WebhookJob } from "../../../core/entities/WebhookJob.js";
import type { JobRepository } from "../../../core/ports/JobRepository.js";
import type { WebhookJobStatus } from "../../../types/index.js";
import type { SqliteClient } from "./SqliteClient.js";

function rowToJob(row: {
  id: string;
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
}): WebhookJob {
  return {
    id: String(row.id),
    event: String(row.event),
    subscriberUrl: String(row.subscriber_url),
    payload: JSON.parse(String(row.payload_json)) as unknown,
    status: row.status as WebhookJobStatus,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    nextAttemptAt: row.next_attempt_at
      ? new Date(String(row.next_attempt_at))
      : null,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
    lastError: row.last_error == null ? null : String(row.last_error),
  };
}

export class SqliteJobRepository implements JobRepository {
  constructor(private readonly sqlite: SqliteClient) {}

  async create(job: WebhookJob): Promise<void> {
    this.sqlite.runMutating(
      `INSERT INTO webhook_jobs (
          id, event, subscriber_url, payload_json, status, attempts, max_attempts,
          next_attempt_at, created_at, updated_at, last_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        job.id,
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
      ],
    );
  }

  async findById(id: string): Promise<WebhookJob | null> {
    const row = this.sqlite.get<{
      id: string;
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
    }>(
      `SELECT id, event, subscriber_url, payload_json, status, attempts, max_attempts,
              next_attempt_at, created_at, updated_at, last_error
       FROM webhook_jobs WHERE id = ?`,
      [id],
    );
    return row ? rowToJob(row) : null;
  }

  async claimPending(id: string, now: Date): Promise<boolean> {
    const changed = this.sqlite.runMutating(
      `UPDATE webhook_jobs
         SET status = 'processing', updated_at = ?
         WHERE id = ?
           AND status = 'pending'
           AND (next_attempt_at IS NULL OR next_attempt_at <= ?)`,
      [now.toISOString(), id, now.toISOString()],
    );
    return changed > 0;
  }

  async save(job: WebhookJob): Promise<void> {
    this.sqlite.runMutating(
      `UPDATE webhook_jobs SET
          event = ?, subscriber_url = ?, payload_json = ?, status = ?, attempts = ?,
          max_attempts = ?, next_attempt_at = ?, updated_at = ?, last_error = ?
        WHERE id = ?`,
      [
        job.event,
        job.subscriberUrl,
        JSON.stringify(job.payload),
        job.status,
        job.attempts,
        job.maxAttempts,
        job.nextAttemptAt?.toISOString() ?? null,
        job.updatedAt.toISOString(),
        job.lastError,
        job.id,
      ],
    );
  }

  async archiveCompleted(id: string): Promise<void> {
    this.sqlite.runMutating(
      `INSERT OR IGNORE INTO webhook_job_archives (
          id, event, subscriber_url, payload_json, status, attempts, max_attempts,
          next_attempt_at, created_at, updated_at, last_error, archived_at
        )
       SELECT
         id, event, subscriber_url, payload_json, status, attempts, max_attempts,
         next_attempt_at, created_at, updated_at, last_error, ?
       FROM webhook_jobs
       WHERE id = ? AND status IN ('delivered', 'failed')`,
      [new Date().toISOString(), id],
    );
    this.sqlite.runMutating(
      `DELETE FROM webhook_jobs
       WHERE id = ? AND status IN ('delivered', 'failed')`,
      [id],
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
         SET status = 'pending', updated_at = ?
         WHERE status = 'processing' AND updated_at < ?`,
      [new Date().toISOString(), cutoff],
    );
  }
}
