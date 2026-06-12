import { useCallback, useMemo, useState } from "react";
import type { ViewState } from "../../core";

const DEFAULT_STATE: ViewState = {
  sort: null,
  query: "",
  filters: {},
  expanded: {},
};

type StateMap = Record<string, ViewState>;

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
  return JSON.parse(raw) as StateMap;
}

export interface ViewStateHandle {
  activeViewId: string | null;
  setActiveView: (viewId: string) => void;
  stateFor: (viewId: string) => ViewState;
  setSort: (viewId: string, fieldId: string) => void;
  setQuery: (viewId: string, query: string) => void;
  setFilter: (viewId: string, fieldId: string, value: unknown) => void;
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
    (viewId: string, fieldId: string, value: unknown) => {
      update(viewId, (prev) => ({
        ...prev,
        filters: { ...prev.filters, [fieldId]: value },
      }));
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
