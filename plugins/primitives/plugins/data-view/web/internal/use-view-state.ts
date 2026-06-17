import { useCallback, useMemo, useState } from "react";
import type { FilterGroup, SortState } from "../../core";
import { isFilterGroup } from "./filter-shape";

/**
 * Device-local per-instance view state. Everything here is ephemeral / per-device:
 * the active-instance selection, plus each instance's `{ query, expanded, sort,
 * filter }`. In **config mode** the durable `sort`/`filter` live on the instance's
 * config row instead (the view model overrides them); the localStorage `sort`/
 * `filter` are the **default-mode** fallback only — there is no config row to
 * write to for a synthesized default instance.
 *
 * State split (see CLAUDE.md):
 *   - active id           → `${storageKey}:active-view`   (always device-local)
 *   - query + expand      → `${storageKey}:view-state`     (always device-local)
 *   - sort + filter       → `${storageKey}:view-state`     (default-mode fallback)
 */

const ACTIVE_SUFFIX = ":active-view";
const STATE_SUFFIX = ":view-state";

interface LocalViewState {
  query: string;
  expanded: Record<string, boolean>;
  sort: SortState | null;
  filter: FilterGroup | null;
}
type LocalMap = Record<string, LocalViewState>;

const EMPTY_LOCAL: LocalViewState = {
  query: "",
  expanded: {},
  sort: null,
  filter: null,
};

// ---------------------------------------------------------------------------
// localStorage helpers (DOMException-guarded — private-mode / quota safe).
// ---------------------------------------------------------------------------

function readString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    if (!(err instanceof DOMException)) throw err;
    return null;
  }
}

function writeString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    if (!(err instanceof DOMException)) throw err;
  }
}

/** Parse the per-instance `{query, expanded, sort, filter}` map, tolerant of
 *  partial / legacy shapes. */
function readLocalMap(key: string): LocalMap {
  const raw = readString(key);
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) return {};
  const out: LocalMap = {};
  for (const [viewId, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== "object" || v === null) continue;
    const r = v as Record<string, unknown>;
    out[viewId] = {
      query: typeof r.query === "string" ? r.query : "",
      expanded:
        typeof r.expanded === "object" && r.expanded !== null
          ? (r.expanded as Record<string, boolean>)
          : {},
      sort: (r.sort as SortState | null | undefined) ?? null,
      filter: isFilterGroup(r.filter) ? r.filter : null,
    };
  }
  return out;
}

export interface EphemeralViewState {
  /** Persisted active-instance id (null → caller falls back to defaultView). */
  activeViewId: string | null;
  setActiveView: (viewId: string) => void;
  /** Raw per-instance local blob — query/expanded always, sort/filter as the
   *  default-mode fallback. The config-mode view model overrides sort/filter. */
  localFor: (viewId: string) => LocalViewState;
  setQuery: (viewId: string, query: string) => void;
  setExpanded: (viewId: string, id: string, next: boolean) => void;
  /** Default-mode sort cycling (null→asc→desc→null) into localStorage. */
  setLocalSort: (viewId: string, fieldId: string) => void;
  /** Default-mode filter write into localStorage. */
  setLocalFilter: (viewId: string, filter: FilterGroup | null) => void;
}

/**
 * Slim localStorage-only ephemeral state. No config_v2 — both modes use this for
 * active-id / query / expand; only **default mode** uses its `sort`/`filter`.
 */
export function useEphemeralViewState(storageKey: string): EphemeralViewState {
  const activeKey = `${storageKey}${ACTIVE_SUFFIX}`;
  const stateKey = `${storageKey}${STATE_SUFFIX}`;

  const [activeViewId, setActiveViewId] = useState<string | null>(() =>
    readString(activeKey),
  );
  const [localMap, setLocalMap] = useState<LocalMap>(() =>
    readLocalMap(stateKey),
  );

  const setActiveView = useCallback(
    (viewId: string) => {
      writeString(activeKey, viewId);
      setActiveViewId(viewId);
    },
    [activeKey],
  );

  const writeLocal = useCallback(
    (viewId: string, mutate: (prev: LocalViewState) => LocalViewState) => {
      setLocalMap((prev) => {
        const current = prev[viewId] ?? EMPTY_LOCAL;
        const next = { ...prev, [viewId]: mutate(current) };
        writeString(stateKey, JSON.stringify(next));
        return next;
      });
    },
    [stateKey],
  );

  const localFor = useCallback(
    (viewId: string): LocalViewState => localMap[viewId] ?? EMPTY_LOCAL,
    [localMap],
  );

  const setQuery = useCallback(
    (viewId: string, query: string) => {
      writeLocal(viewId, (prev) => ({ ...prev, query }));
    },
    [writeLocal],
  );

  const setExpanded = useCallback(
    (viewId: string, id: string, next: boolean) => {
      writeLocal(viewId, (prev) => ({
        ...prev,
        expanded: { ...prev.expanded, [id]: next },
      }));
    },
    [writeLocal],
  );

  const setLocalSort = useCallback(
    (viewId: string, fieldId: string) => {
      writeLocal(viewId, (prev) => {
        // null → asc → desc → null cycle (matches use-data-table.toggleSort).
        let sort: SortState | null;
        if (prev.sort?.fieldId !== fieldId)
          sort = { fieldId, direction: "asc" };
        else if (prev.sort.direction === "asc")
          sort = { fieldId, direction: "desc" };
        else sort = null;
        return { ...prev, sort };
      });
    },
    [writeLocal],
  );

  const setLocalFilter = useCallback(
    (viewId: string, filter: FilterGroup | null) => {
      writeLocal(viewId, (prev) => ({ ...prev, filter }));
    },
    [writeLocal],
  );

  return useMemo(
    () => ({
      activeViewId,
      setActiveView,
      localFor,
      setQuery,
      setExpanded,
      setLocalSort,
      setLocalFilter,
    }),
    [
      activeViewId,
      setActiveView,
      localFor,
      setQuery,
      setExpanded,
      setLocalSort,
      setLocalFilter,
    ],
  );
}
