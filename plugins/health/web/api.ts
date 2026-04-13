import type { HealthResponse } from "../shared/protocol";

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
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const h = await getHealth();
    if (h && h.startedAt > previousStartedAt) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}
