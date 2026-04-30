CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  event TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (event, url)
);

CREATE INDEX IF NOT EXISTS idx_subscribers_event ON subscribers (event);

CREATE TABLE IF NOT EXISTS webhook_jobs (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  event TEXT NOT NULL,
  subscriber_url TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL,
  next_attempt_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_error TEXT,
  lease_owner TEXT,
  lease_expires_at TEXT,
  processing_started_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_webhook_jobs_status_next ON webhook_jobs (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_webhook_jobs_event ON webhook_jobs (event);
CREATE INDEX IF NOT EXISTS idx_webhook_jobs_lease ON webhook_jobs (status, lease_expires_at);
