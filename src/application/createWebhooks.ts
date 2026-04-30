import type { CreateWebhooksOptions, WebhooksApi } from "../types/index.js";
import { buildContainer } from "./container.js";

export async function createWebhooks(
  options: CreateWebhooksOptions,
): Promise<WebhooksApi> {
  const c = await buildContainer(options);
  const deliveryWorkers = Math.max(1, Math.trunc(options.deliveryWorkers ?? 1));

  await c.queue.startWorker((jobId) => c.delivery.processJob(jobId), {
    workerCount: deliveryWorkers,
  });
  await c.jobs.resetStaleProcessing(120_000);
  if (c.queue.recoverPending) {
    await c.queue.recoverPending(() => c.jobs.listRecoverableJobIds());
  }

  return {
    register: (event, url) => c.webhooks.register(event, url),
    emit: (event, payload) => c.webhooks.emit(event, payload),
    close: async () => {
      await c.queue.stopWorker();
      await c.sqlite.close();
    },
  };
}
