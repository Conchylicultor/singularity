import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import type { RefreshSourceResult } from "../../core";

/**
 * The seam between the "Refresh now" endpoint (here) and the refresh ENGINE
 * (the `refresh` plugin, which owns the jobs).
 *
 * It exists because the dependency only runs one way: `refresh` imports
 * `events-core` for the tables and the source-type registry, so `events-core`
 * cannot import `refresh` back without a cycle. A single-handler registration
 * inverts it — `refresh` calls `registerRefreshRunner(...)` from its `register`
 * phase, and this plugin's handler dispatches through it.
 *
 * Single handler, not a keyed registry: there is exactly one engine. Unlike
 * `defineReportSink` (which swallows, because it is called on error paths), an
 * absent handler here is a LOUD 503 — a composition that ships the Events UI
 * without its engine is broken, and a user pressing "Refresh now" must be told
 * so rather than watching nothing happen.
 */
export type RefreshRunner = (sourceId: string) => Promise<RefreshSourceResult>;

let runner: RefreshRunner | null = null;

export function registerRefreshRunner(fn: RefreshRunner): void {
  if (runner) {
    throw new Error("[events] a refresh runner is already registered");
  }
  runner = fn;
}

/** Ask the engine to refresh one source. Throws when no engine is installed. */
export async function requestSourceRefresh(
  sourceId: string,
): Promise<RefreshSourceResult> {
  if (!runner) {
    throw new HttpError(
      503,
      "No events refresh engine is installed in this composition.",
    );
  }
  return runner(sourceId);
}
