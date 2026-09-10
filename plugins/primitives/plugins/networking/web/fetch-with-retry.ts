export interface FetchWithRetryOptions {
  retries?: number;
  retryOn?: number[];
  backoffMs?: number;
}

const DEFAULT_RETRY_ON = [502, 503, 504];

// Retries a network throw or a `retryOn` status, sleeping
// `backoffMs * 2^attempt` (±15% jitter) between attempts, so `retries` retries
// wait about `backoffMs * (2^retries - 1)` in total. Any other status — a 4xx
// included — is returned at once. The LAST attempt's response is returned
// whatever its status, so the caller's own non-ok handling sees the real
// response; only a network throw on the last attempt is rethrown. An aborted
// `init.signal` is never retried.
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts: FetchWithRetryOptions = {},
): Promise<Response> {
  const retries = opts.retries ?? 3;
  const retryOn = opts.retryOn ?? DEFAULT_RETRY_ON;
  const backoffMs = opts.backoffMs ?? 300;

  for (let attempt = 0; ; attempt++) {
    const last = attempt >= retries;
    try {
      const res = await fetch(input, init);
      if (last || !retryOn.includes(res.status)) return res;
    } catch (err) {
      if (last || init?.signal?.aborted) throw err;
    }
    const jitter = Math.random() * 0.3 + 0.85;
    await new Promise((r) =>
      setTimeout(r, backoffMs * Math.pow(2, attempt) * jitter),
    );
  }
}
