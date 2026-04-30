-- Future-ready: mirror sqlite schema with native types when Postgres adapters ship.

CREATE TABLE IF NOT EXISTS subscribers (
  id UUID PRIMARY KEY,
  event TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event, url)
);

CREATE INDEX IF NOT EXISTS idx_subscribers_event ON subscribers (event);

CREATE TABLE IF NOT EXISTS webhook_jobs (
  id UUID PRIMARY KEY,
  event TEXT NOT NULL,
  subscriber_url TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL,
  next_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_webhook_jobs_status_next ON webhook_jobs (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_webhook_jobs_event ON webhook_jobs (event);
