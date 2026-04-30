import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWebhooks } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dataDir = join(root, '.data');
const dbPath = join(dataDir, 'webhooks.sqlite');

const useBullMq = process.env.USE_BULLMQ === '1';
const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

async function main() {
  await mkdir(dataDir, { recursive: true });

  const hookUrl = process.env.HOOK_URL ?? 'http://127.0.0.1:4010/hook';

  const webhooks = await createWebhooks({
    sqlitePath: dbPath,
    maxDeliveryAttempts: 6,
    queue: useBullMq
      ? {
          type: 'bullmq',
          options: {
            connection: redisUrl,
            queueName: 'webhook-lib-example',
          },
        }
      : { type: 'memory', options: { concurrency: 4, pollIntervalMs: 150 } },
  });

  await webhooks.register('order.created', hookUrl);
  console.log('Registered subscriber for order.created');

  await webhooks.emit('order.created', { orderId: 123 });
  console.log('Emitted order.created (delivery runs in background)');

  await new Promise((r) => setTimeout(r, 3000));
  await webhooks.close();
  console.log('Closed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
