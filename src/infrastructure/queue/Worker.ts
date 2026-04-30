export interface IntervalWorkerHandle {
  start(): void;
  stop(): void;
}

export function createIntervalWorker(input: {
  intervalMs: number;
  onTick: () => void | Promise<void>;
}): IntervalWorkerHandle {
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  return {
    start() {
      if (running) return;
      running = true;
      const tick = () => {
        if (!running) return;
        void Promise.resolve(input.onTick()).finally(() => {
          if (running) timer = setTimeout(tick, input.intervalMs);
        });
      };
      timer = setTimeout(tick, 0);
    },
    stop() {
      running = false;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
