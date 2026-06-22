import { implement } from "@plugins/infra/plugins/endpoints/server";
import { loadResourceByKey } from "@plugins/framework/plugins/server-core/core";
import { readPersistedSnapshots } from "@plugins/database/plugins/live-state-snapshot/server";
import { bootSnapshot } from "../../core";
import { bootCriticalKeys } from "./boot-keys";

// Serves every boot-critical resource in one request so the client hydrates them
// all before first paint.
//
// L2 fast path: read the persisted `live_state_snapshot` values in ONE query
// (low-ms, no loaders on the hot request path) and serve those directly. Only
// keys with NO persisted row (first-ever boot, or a newly-added resource before
// its first recompute) fall back to a from-scratch `loadResourceByKey` — the
// original behavior. A failed fallback loader is OMITTED (not fatal) so one broken
// resource never bricks the snapshot; that key falls back to its normal WS
// sub-ack. See
// research/2026-06-22-global-live-state-l2-persisted-materialization.md §3.4.
export const handleBootSnapshot = implement(bootSnapshot, async () => {
  const keys = bootCriticalKeys();
  const persisted = await readPersistedSnapshots(keys);

  const missing = keys.filter((k) => !persisted.has(k));
  const loaded = await Promise.allSettled(
    missing.map(async (k): Promise<[string, unknown]> => [k, await loadResourceByKey(k)]),
  );

  const resources: Record<string, unknown> = {};
  for (const k of keys) {
    if (persisted.has(k)) resources[k] = persisted.get(k);
  }
  for (const r of loaded) {
    if (r.status === "fulfilled") resources[r.value[0]] = r.value[1];
  }
  return { resources };
});
