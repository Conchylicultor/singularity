import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { listVersions } from "@plugins/history/plugins/engine/core";

export interface UseVersionHistoryOptions {
  /** Set false to suspend the query (e.g. while the dialog is closed). */
  enabled?: boolean;
}

// Version-timeline hook. Wraps the engine's `listVersions` endpoint for one
// (sourceId, entityId) pair, returning version metadata newest-first. Mirrors
// `useSearch` — a plain query gated by `enabled` so the closed dialog stays
// idle; the dialog refetches on open and invalidates this list after a restore.
export function useVersionHistory(
  sourceId: string,
  entityId: string,
  opts: UseVersionHistoryOptions = {},
) {
  return useEndpoint(
    listVersions,
    { sourceId, entityId },
    { enabled: opts.enabled !== false },
  );
}
