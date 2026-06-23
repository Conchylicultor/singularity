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

  const t0 = performance.now();
  const persisted = await readPersistedSnapshots(keys);
  const persistedReadMs = performance.now() - t0;

  const missing = keys.filter((k) => !persisted.has(k));
  const loaded = await Promise.allSettled(
    missing.map(async (k): Promise<[string, unknown, number]> => {
      const s = performance.now();
      const v = await loadResourceByKey(k);
      return [k, v, performance.now() - s];
    }),
  );

  const resources: Record<string, unknown> = {};
  const timings: Record<string, { source: "persisted" | "loader"; workMs: number }> = {};

  // The persisted keys all share the single batched read, so there's no per-key
  // server work to attribute — amortize that one read across them for a directional
  // work number (the read is one query, not per-key).
  const persistedKeys = keys.filter((k) => persisted.has(k));
  const perPersisted = persistedKeys.length > 0 ? persistedReadMs / persistedKeys.length : 0;
  for (const k of persistedKeys) {
    resources[k] = persisted.get(k);
    timings[k] = { source: "persisted", workMs: perPersisted };
  }

  // A failed fallback loader stays OMITTED (rejected → never reaches resources/timings).
  for (const r of loaded) {
    if (r.status === "fulfilled") {
      const [k, v, workMs] = r.value;
      resources[k] = v;
      timings[k] = { source: "loader", workMs };
    }
  }
  return { resources, timings };
});
