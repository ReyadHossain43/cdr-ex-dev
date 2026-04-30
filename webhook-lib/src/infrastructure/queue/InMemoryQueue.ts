import type { JobHandler, QueueDriver } from '../../core/ports/QueueDriver.js';
import { createIntervalWorker } from './Worker.js';

type BacklogItem = { jobId: string; runAt: number };

export class InMemoryQueue implements QueueDriver {
  private backlog: BacklogItem[] = [];
  private handler: JobHandler | null = null;
  private inFlight = 0;
  private workerHandle: ReturnType<typeof createIntervalWorker> | null = null;
  private stopping = false;
  private readonly concurrency: number;
  private readonly tickMs: number;

  constructor(options?: { concurrency?: number; pollIntervalMs?: number }) {
    this.concurrency = options?.concurrency ?? 4;
    this.tickMs = options?.pollIntervalMs ?? 200;
  }

  async enqueue(jobId: string, delayMs = 0): Promise<void> {
    const runAt = Date.now() + delayMs;
    this.backlog.push({ jobId, runAt });
    this.backlog.sort((a, b) => a.runAt - b.runAt);
  }

  async startWorker(handler: JobHandler): Promise<void> {
    this.handler = handler;
    this.stopping = false;
    this.workerHandle = createIntervalWorker({
      intervalMs: this.tickMs,
      onTick: () => this.pump(),
    });
    this.workerHandle.start();
  }

  async stopWorker(): Promise<void> {
    this.stopping = true;
    this.workerHandle?.stop();
    this.workerHandle = null;
    const deadline = Date.now() + 30_000;
    while (this.inFlight > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    this.handler = null;
    this.stopping = false;
  }

  async recoverPending(listJobIds: () => Promise<string[]>): Promise<void> {
    const ids = await listJobIds();
    for (const id of ids) {
      await this.enqueue(id, 0);
    }
  }

  private async pump(): Promise<void> {
    if (!this.handler || this.stopping) return;
    const now = Date.now();
    this.backlog.sort((a, b) => a.runAt - b.runAt);

    while (this.inFlight < this.concurrency && this.backlog.length > 0) {
      const next = this.backlog[0]!;
      if (next.runAt > now) break;
      this.backlog.shift();
      const h = this.handler;
      const jobId = next.jobId;
      this.inFlight++;
      void h(jobId)
        .catch(() => undefined)
        .finally(() => {
          this.inFlight--;
        });
    }
  }
}
