export interface FetchWithRetryOptions {
  retries?: number;
  retryOn?: number[];
  backoffMs?: number;
}

const DEFAULT_RETRY_ON = [502, 503, 504];

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts: FetchWithRetryOptions = {},
): Promise<Response> {
  const retries = opts.retries ?? 3;
  const retryOn = opts.retryOn ?? DEFAULT_RETRY_ON;
  const backoffMs = opts.backoffMs ?? 300;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, init);
      if (!retryOn.includes(res.status)) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    if (attempt < retries) {
      const jitter = Math.random() * 0.3 + 0.85;
      await new Promise((r) => setTimeout(r, backoffMs * Math.pow(2, attempt) * jitter));
    }
  }
  throw lastErr;
}
