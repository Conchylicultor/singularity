export type DelayStrategy = (attempt: number) => number;

export class RetryDeadlineError extends Error {
  constructor(elapsedMs: number) {
    super(`retryUntil deadline exceeded after ${elapsedMs}ms`);
    this.name = "RetryDeadlineError";
  }
}

export async function retryUntil<T, D = never>(
  fn: (attempt: number) => Promise<T | null | undefined>,
  opts: { delay: DelayStrategy; signal?: AbortSignal; deadline?: number; onDeadline?: () => D },
): Promise<T | D> {
  const start = Date.now();
  let attempt = 0;
  while (true) {
    if (opts.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    if (opts.deadline != null && Date.now() - start >= opts.deadline) {
      if (opts.onDeadline) return opts.onDeadline();
      throw new RetryDeadlineError(Date.now() - start);
    }
    const result = await fn(attempt);
    if (result != null) return result;
    await new Promise<void>((r) => setTimeout(r, opts.delay(attempt)));
    attempt++;
  }
}

export const fixed = (ms: number): DelayStrategy => () => ms;

export const exponential = (
  opts?: { initial?: number; max?: number },
): DelayStrategy => {
  const initial = opts?.initial ?? 100;
  const max = opts?.max ?? 10_000;
  return (attempt) => Math.min(initial * 2 ** attempt, max);
};

export const withJitter = (
  strategy: DelayStrategy,
  factor = 0.2,
): DelayStrategy => {
  return (attempt) => strategy(attempt) * (1 + (Math.random() - 0.5) * factor);
};
