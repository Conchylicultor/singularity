import { useDeferredLoadState } from "@plugins/framework/plugins/web-sdk/core";
import { useStaleFrontend } from "./use-stale-frontend";

/**
 * Whether this tab should be reloaded, and why. Both reasons have one answer
 * (reload), so they are one signal:
 *
 * - `stale` — the server now serves a different frontend than the one this tab
 *   is running.
 * - `broken` — at least one plugin failed to load in this tab, so part of the
 *   app is missing until a reload re-fetches it. It is the stronger reason, so
 *   it wins; `stale` rides along so the copy can name both.
 *
 * A plugin that failed during the background (deferred) tier shows NO banner —
 * this is its only app-wide surface. Core-stage failures land in the same set
 * and additionally keep their boot banner.
 */
export type ReloadAdvice =
  | { kind: "none" }
  | { kind: "stale" }
  | { kind: "broken"; stale: boolean; failedCount: number };

export function useReloadAdvice(): ReloadAdvice {
  // `stale` is false while the deployment is still loading — correct, not a
  // collapse (see useStaleFrontend): staleness is unknowable until then.
  const { stale } = useStaleFrontend();
  const { failedPluginPaths } = useDeferredLoadState();
  if (failedPluginPaths.size > 0) {
    return { kind: "broken", stale, failedCount: failedPluginPaths.size };
  }
  return stale ? { kind: "stale" } : { kind: "none" };
}
