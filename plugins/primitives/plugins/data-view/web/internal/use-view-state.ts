import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import type { FilterGroup, SortState, ViewState } from "../../core";
import {
  viewStateDescriptor,
  type SurfaceState,
  type SurfacesState,
} from "../../shared/view-state-config";
import { isFilterGroup } from "./filter-shape";

/** Trailing-edge debounce for config writes — `setConfig` POSTs the whole doc. */
const WRITE_DEBOUNCE_MS = 400;

const EMPTY_SURFACE: SurfaceState = { activeView: null, views: {} };

/** Device-local per-view state: search query + tree expand map. */
interface LocalViewState {
  query: string;
  expanded: Record<string, boolean>;
}
type LocalMap = Record<string, LocalViewState>;

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

/**
 * Read the device-local map (`query` + `expanded` only) from the legacy/shared
 * `${storageKey}:view-state` blob. Tolerant of the legacy shape that also
 * carried `sort`/`filter` — those keys are simply ignored here (durable state
 * now lives in config).
 */
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
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Config-surface sanitize: defensively validate filters at the merge boundary.
// ---------------------------------------------------------------------------

/**
 * Re-validate filters at the merge boundary: the config schema guarantees the
 * surface shape, but a filter persisted against an older field-type operator
 * set is structurally a group yet semantically stale — `isFilterGroup` is the
 * authoritative shape gate, so anything it rejects drops to null.
 */
function sanitizeSurface(raw: SurfaceState | undefined): SurfaceState {
  if (!raw) return EMPTY_SURFACE;
  const views: SurfaceState["views"] = {};
  for (const [viewId, v] of Object.entries(raw.views)) {
    views[viewId] = {
      sort: v.sort,
      filter: isFilterGroup(v.filter) ? v.filter : null,
    };
  }
  return { activeView: raw.activeView, views };
}

// ---------------------------------------------------------------------------
// One-time migration from the legacy localStorage durable state.
// ---------------------------------------------------------------------------

/**
 * Build a seed surface from the legacy `${storageKey}:view-state` blob (old
 * shape: `Record<viewId, {sort,query,filter,expanded}>`) plus the legacy
 * `${storageKey}:active-view` key. Returns null when there is nothing durable
 * worth migrating (no non-null sort, no valid filter, no persisted active view).
 */
function buildMigrationSeed(
  stateKey: string,
  activeKey: string,
): SurfaceState | null {
  const legacyActive = readString(activeKey);
  const raw = readString(stateKey);
  const views: SurfaceState["views"] = {};
  let hasDurable = false;

  if (raw) {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      for (const [viewId, v] of Object.entries(
        parsed as Record<string, unknown>,
      )) {
        if (typeof v !== "object" || v === null) continue;
        const r = v as Record<string, unknown>;
        const sort = (r.sort as SortState | null | undefined) ?? null;
        const filter = isFilterGroup(r.filter) ? r.filter : null;
        if (sort || filter) {
          views[viewId] = { sort, filter };
          hasDurable = true;
        }
      }
    }
  }

  if (!hasDurable && !legacyActive) return null;
  return { activeView: legacyActive ?? null, views };
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

  // --- Durable state (config_v2) -----------------------------------------
  const config = useConfig(viewStateDescriptor);
  const setConfig = useSetConfig(viewStateDescriptor);
  const configSurface = sanitizeSurface(config.surfaces[storageKey]);

  // Optimistic local mirror of the durable surface. Updates feel instant; we
  // reconcile from config when external truth advances and there is no pending
  // un-flushed write of our own.
  const [mirror, setMirror] = useState<SurfaceState>(() => configSurface);

  // Freshest config surfaces, kept in a ref so the debounced flush does a
  // read-modify-write against current truth rather than a stale closure.
  const surfacesRef = useRef<SurfacesState>(config.surfaces);
  surfacesRef.current = config.surfaces;

  // Latest mirror to flush, plus the pending-write flag used to gate reconcile.
  const pendingRef = useRef<SurfaceState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setConfigRef = useRef(setConfig);
  setConfigRef.current = setConfig;
  const storageKeyRef = useRef(storageKey);
  storageKeyRef.current = storageKey;

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const next = pendingRef.current;
    if (next === null) return;
    pendingRef.current = null;
    const key = storageKeyRef.current;
    setConfigRef.current("surfaces", {
      ...surfacesRef.current,
      [key]: next,
    });
  }, []);

  const scheduleWrite = useCallback(
    (next: SurfaceState) => {
      pendingRef.current = next;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, WRITE_DEBOUNCE_MS);
    },
    [flush],
  );

  // Reconcile the mirror from config when external truth advances and we have
  // no pending write. JSON identity guards against re-render thrash.
  const configSurfaceJson = JSON.stringify(configSurface);
  useEffect(() => {
    if (pendingRef.current !== null) return;
    setMirror((prev) =>
      JSON.stringify(prev) === configSurfaceJson ? prev : configSurface,
    );
    // configSurface is derived from configSurfaceJson; depending on the string
    // keeps this effect stable across identical re-derivations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configSurfaceJson]);

  // Flush any pending durable write on unmount so a quick toggle isn't lost.
  useEffect(() => () => flush(), [flush]);

  const writeSurface = useCallback(
    (mutate: (prev: SurfaceState) => SurfaceState) => {
      setMirror((prev) => {
        const next = mutate(prev);
        scheduleWrite(next);
        return next;
      });
    },
    [scheduleWrite],
  );

  // --- Device-local state (localStorage) ---------------------------------
  const [localMap, setLocalMap] = useState<LocalMap>(() =>
    readLocalMap(stateKey),
  );

  const writeLocal = useCallback(
    (viewId: string, mutate: (prev: LocalViewState) => LocalViewState) => {
      setLocalMap((prev) => {
        const current = prev[viewId] ?? { query: "", expanded: {} };
        const next = { ...prev, [viewId]: mutate(current) };
        writeString(stateKey, JSON.stringify(next));
        return next;
      });
    },
    [stateKey],
  );

  // --- One-time migration (runs at most once, only when config is empty) --
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current) return;
    // Only seed when this surface has no durable config yet.
    if (surfacesRef.current[storageKey] !== undefined) {
      migratedRef.current = true;
      return;
    }
    const seed = buildMigrationSeed(stateKey, activeKey);
    migratedRef.current = true;
    if (!seed) return;
    setMirror(seed);
    setConfigRef.current("surfaces", {
      ...surfacesRef.current,
      [storageKey]: seed,
    });
    // Run once on mount; refs carry the freshest values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Public handle ------------------------------------------------------
  const activeViewId = mirror.activeView ?? defaultView ?? null;

  const setActiveView = useCallback(
    (viewId: string) => {
      writeSurface((prev) => ({ ...prev, activeView: viewId }));
    },
    [writeSurface],
  );

  const stateFor = useCallback(
    (viewId: string): ViewState => {
      const durable = mirror.views[viewId];
      const local = localMap[viewId];
      return {
        sort: durable?.sort ?? null,
        filter: durable?.filter ?? null,
        query: local?.query ?? "",
        expanded: local?.expanded ?? {},
      };
    },
    [mirror, localMap],
  );

  const setSort = useCallback(
    (viewId: string, fieldId: string) => {
      writeSurface((prev) => {
        const cur = prev.views[viewId] ?? { sort: null, filter: null };
        // null → asc → desc → null cycle (matches use-data-table.toggleSort).
        let sort: SortState | null;
        if (cur.sort?.fieldId !== fieldId) sort = { fieldId, direction: "asc" };
        else if (cur.sort.direction === "asc")
          sort = { fieldId, direction: "desc" };
        else sort = null;
        return {
          ...prev,
          views: { ...prev.views, [viewId]: { ...cur, sort } },
        };
      });
    },
    [writeSurface],
  );

  const setFilter = useCallback(
    (viewId: string, filter: FilterGroup | null) => {
      writeSurface((prev) => {
        const cur = prev.views[viewId] ?? { sort: null, filter: null };
        return {
          ...prev,
          views: { ...prev.views, [viewId]: { ...cur, filter } },
        };
      });
    },
    [writeSurface],
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
