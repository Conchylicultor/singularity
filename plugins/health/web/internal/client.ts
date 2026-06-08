import { retryUntil, fixed } from "@plugins/packages/plugins/retry/core";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import type { HealthResponse } from "../../shared/protocol";
import { getHealth as getHealthEndpoint } from "../../shared/endpoints";

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse | null> {
  try {
    return await fetchEndpoint(getHealthEndpoint, {}, { signal });
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
