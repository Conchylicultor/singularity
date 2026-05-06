import { retryUntil, fixed } from "@plugins/packages/plugins/retry/shared";
import type { HealthResponse } from "../../shared/protocol";

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse | null> {
  try {
    const res = await fetch("/api/health", { signal });
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}

export async function waitForRestart(
  previousStartedAt: number,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<boolean> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const intervalMs = opts.intervalMs ?? 500;
  return retryUntil(
    async () => {
      const h = await getHealth();
      return h && h.startedAt > previousStartedAt ? true : null;
    },
    { delay: fixed(intervalMs), deadline: timeoutMs, onDeadline: () => false },
  );
}
