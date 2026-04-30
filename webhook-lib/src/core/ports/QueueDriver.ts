export type JobHandler = (jobId: string) => Promise<void>;

export interface QueueDriver {
  enqueue(jobId: string, delayMs?: number): Promise<void>;
  startWorker(handler: JobHandler): Promise<void>;
  stopWorker(): Promise<void>;
  recoverPending?(listJobIds: () => Promise<string[]>): Promise<void>;
}
