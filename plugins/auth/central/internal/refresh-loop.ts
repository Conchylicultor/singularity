import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import { listProviders } from "./registry";
import { getAccount } from "./token-store";
import { getAccessTokenInternal } from "./token-access";

const TICK_INTERVAL_MS = 60_000;
const REFRESH_LEAD_MS = 5 * 60 * 1000;

// biome-ignore lint/suspicious/noExplicitAny: Bun timer interop.
let timer: any = null;

export function startRefreshLoop(): void {
  if (timer) return;
  timer = setInterval(() => {
    void runTracked("auth:refresh", () => tick());
  }, TICK_INTERVAL_MS);
  if (timer && typeof timer.unref === "function") timer.unref();
}

export function stopRefreshLoop(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function tick(): Promise<void> {
  const now = Date.now();
  for (const provider of listProviders()) {
    if (provider.kind !== "oauth2") continue;
    const account = getAccount(provider.id, "primary");
    if (!account || account.needsReconsent || !account.refreshToken) continue;
    const expiresAt = account.expiresAt ?? 0;
    if (expiresAt > now + REFRESH_LEAD_MS) continue;
    // getAccessTokenInternal owns the refresh path + per-account mutex; we
    // await but swallow errors (logged inside on failure).
    try {
      await getAccessTokenInternal({ providerId: provider.id });
    // eslint-disable-next-line promise-safety/no-bare-catch
    } catch {
      /* errors are persisted to the account.lastRefreshError field */
    }
  }
}
