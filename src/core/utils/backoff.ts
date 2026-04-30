export function computeBackoffMs(
  attempt: number,
  baseMs = 1000,
  capMs = 300_000,
): number {
  const exp = Math.min(attempt, 10);
  const raw = baseMs * 2 ** exp;
  const jitter = Math.floor(Math.random() * Math.min(raw, 5000));
  return Math.min(raw + jitter, capMs);
}
