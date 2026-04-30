# webhook-lib

TypeScript library for Node.js that delivers webhook HTTP POSTs to registered subscriber URLs with **durable jobs** (SQLite) and a **background queue** so `emit` returns quickly and work survives process restarts.

Persistence uses **[sql.js](https://github.com/sql-js/sql.js)** (SQLite compiled to WebAssembly) so the library installs without native `node-gyp` addons while still giving you a normal SQLite file on disk.

## Quick start

```typescript
import { createWebhooks } from "webhook-lib";

const webhooks = await createWebhooks({
  sqlitePath: "./data/webhooks.sqlite",
  deliveryWorkers: 2,
  queue: { type: "memory", options: { concurrency: 4 } },
});

await webhooks.register("order.created", "https://example.com/hook");
await webhooks.emit("order.created", { orderId: 123 });
```

`emit` persists one row per subscriber delivery attempt, enqueues job IDs, and returns after enqueue—not after HTTP completes.

## Run the example

From `webhook-lib/`:

1. Install dependencies:

```bash
npm install
```

2. Terminal A — receiver (simple HTTP server):

```bash
npm run example:receiver
```

3. Terminal B — publisher (in-memory queue by default):

```bash
npm run example:app
```

You should see the receiver log `order.created` with JSON body `{"orderId":123}`.

### Example with BullMQ + Redis

Requires Redis listening (e.g. `docker run -p 6379:6379 redis:7-alpine`).

```bash
USE_BULLMQ=1 REDIS_URL=redis://127.0.0.1:6379 npm run example:app
```

Optional: `HOOK_URL=http://127.0.0.1:4010/other` if you change the receiver path/port (`RECEIVER_PORT` on the receiver script).

## Worker scaling

- `deliveryWorkers` controls how many queue workers are started in-process (default `1`).
- For memory queue, `queue.options.concurrency` is the in-flight limit per process and `workerCount` can also be set under `queue.options`.
- For BullMQ queue, use `queue.options.workerCount` and `queue.options.workerConcurrency` to tune parallelism per process.

## Build the library

```bash
npm run build
```

Consumers compile against `dist/` types and import `webhook-lib` after `npm pack` / workspace link / publish.

## Delivery guarantees (current version)

- **Durability of work**: Subscribers and jobs are stored in SQLite (WAL). A crash after `emit` resolves does not lose the job record; pending work is **re-enqueued on startup** (memory queue) or held in Redis (BullMQ) plus SQLite as source of truth for status.
- **Caller isolation**: `emit` only writes DB rows and pushes queue messages; slow or failing HTTP does not block the caller beyond that fast path.
- **Retries**: Failed deliveries use exponential backoff with jitter (capped). After `maxDeliveryAttempts`, the job is marked `failed` with the last error stored.
- **Stuck `processing`**: Jobs left in `processing` (e.g. mid-delivery crash) are reset to `pending` after a staleness window on startup so they can run again.

## Non-goals / limits

- **At-most-once vs at-least-once**: Under rare races (duplicate queue messages), a subscriber could see more than one delivery for the same logical event. Strong exactly-once would need idempotency keys on the subscriber side or transactional outbox with stricter locking.
- **Ordering**: Not guaranteed across subscribers or retries.
- **Postgres adapters** under `infrastructure/db/postgres/` are placeholders for a future implementation; use SQLite today.

## Architecture

Hexagonal-style layout:

- `src/core` — entities, pure services (`WebhookService`, `DeliveryService`), ports, `backoff` util (no DB/HTTP imports).
- `src/infrastructure` — SQLite repositories, `HttpClient`, `InMemoryQueue` + interval `Worker`, `BullMqQueueDriver`.
- `src/application` — `container.ts` wiring and `createWebhooks` factory.

## Tradeoff to revisit with more time

The design favors **simple distribution and operation** (sql.js + SQLite file, optional Redis only for the queue) over **peak durability throughput**: every job state transition rewrites the database file, and a hot emitter can bottleneck on that single-writer path. With more time, the same ports would back a **native SQLite or Postgres job store** plus **stricter handoff between queue messages and row-level locking** so multiple workers could scale out without extra duplicate-delivery risk beyond today’s best-effort idempotency.

## License

MIT
