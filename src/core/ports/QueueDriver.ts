export type JobHandler = (jobId: string) => Promise<void>;

export interface WorkerStartOptions {
  workerCount?: number;
}

export interface QueueDriver {
  enqueue(jobId: string, delayMs?: number): Promise<void>;
  startWorker(handler: JobHandler, options?: WorkerStartOptions): Promise<void>;
  stopWorker(): Promise<void>;
  recoverPending?(listJobIds: () => Promise<string[]>): Promise<void>;
}
