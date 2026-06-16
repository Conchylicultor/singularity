import { useCallback, useMemo, useState } from "react";
import type { FilterGroup, ViewState } from "../../core";
import { isFilterGroup } from "./filter-shape";

const DEFAULT_STATE: ViewState = {
  sort: null,
  query: "",
  filter: null,
  expanded: {},
};

type StateMap = Record<string, ViewState>;

/**
 * Tolerant deserialize: validate each view's persisted `filter` against the
 * FilterGroup shape. Stale shapes (e.g. the old `Record<fieldId, value>` map)
 * are dropped to null rather than silently coerced.
 */
function sanitizeStateMap(parsed: unknown): StateMap {
  if (typeof parsed !== "object" || parsed === null) return {};
  const out: StateMap = {};
  for (const [viewId, raw] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof raw !== "object" || raw === null) continue;
    const v = raw as Partial<ViewState>;
    out[viewId] = {
      sort: v.sort ?? null,
      query: typeof v.query === "string" ? v.query : "",
      filter: isFilterGroup(v.filter) ? v.filter : null,
      expanded:
        typeof v.expanded === "object" && v.expanded !== null
          ? v.expanded
          : {},
    };
  }
  return out;
}

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

function readStateMap(key: string): StateMap {
  const raw = readString(key);
  if (!raw) return {};
  return sanitizeStateMap(JSON.parse(raw));
}

export interface ViewStateHandle {
  activeViewId: string | null;
  setActiveView: (viewId: string) => void;
  stateFor: (viewId: string) => ViewState;
  setSort: (viewId: string, fieldId: string) => void;
  setQuery: (viewId: string, query: string) => void;
  setFilter: (viewId: string, filter: FilterGroup | null) => void;
  setExpanded: (viewId: string, id: string, next: boolean) => void;
}

export function useViewState(
  storageKey: string,
  _viewIds: string[],
  defaultView: string | undefined,
): ViewStateHandle {
  const activeKey = `${storageKey}:active-view`;
  const stateKey = `${storageKey}:view-state`;

  const [activeViewId, setActiveViewId] = useState<string | null>(
    () => readString(activeKey) ?? defaultView ?? null,
  );
  const [stateMap, setStateMap] = useState<StateMap>(() =>
    readStateMap(stateKey),
  );

  const persistMap = useCallback(
    (next: StateMap) => {
      writeString(stateKey, JSON.stringify(next));
    },
    [stateKey],
  );

  const setActiveView = useCallback(
    (viewId: string) => {
      setActiveViewId(viewId);
      writeString(activeKey, viewId);
    },
    [activeKey],
  );

  const stateFor = useCallback(
    (viewId: string): ViewState => stateMap[viewId] ?? DEFAULT_STATE,
    [stateMap],
  );

  const update = useCallback(
    (viewId: string, mutate: (prev: ViewState) => ViewState) => {
      setStateMap((prev) => {
        const current = prev[viewId] ?? DEFAULT_STATE;
        const next = { ...prev, [viewId]: mutate(current) };
        persistMap(next);
        return next;
      });
    },
    [persistMap],
  );

  const setSort = useCallback(
    (viewId: string, fieldId: string) => {
      update(viewId, (prev) => {
        // null → asc → desc → null cycle (matches use-data-table.toggleSort).
        if (prev.sort?.fieldId !== fieldId) {
          return { ...prev, sort: { fieldId, direction: "asc" } };
        }
        if (prev.sort.direction === "asc") {
          return { ...prev, sort: { fieldId, direction: "desc" } };
        }
        return { ...prev, sort: null };
      });
    },
    [update],
  );

  const setQuery = useCallback(
    (viewId: string, query: string) => {
      update(viewId, (prev) => ({ ...prev, query }));
    },
    [update],
  );

  const setFilter = useCallback(
    (viewId: string, filter: FilterGroup | null) => {
      update(viewId, (prev) => ({ ...prev, filter }));
    },
    [update],
  );

  const setExpanded = useCallback(
    (viewId: string, id: string, next: boolean) => {
      update(viewId, (prev) => ({
        ...prev,
        expanded: { ...(prev.expanded ?? {}), [id]: next },
      }));
    },
    [update],
  );

  return useMemo(
    () => ({
      activeViewId,
      setActiveView,
      stateFor,
      setSort,
      setQuery,
      setFilter,
      setExpanded,
    }),
    [
      activeViewId,
      setActiveView,
      stateFor,
      setSort,
      setQuery,
      setFilter,
      setExpanded,
    ],
  );
}
