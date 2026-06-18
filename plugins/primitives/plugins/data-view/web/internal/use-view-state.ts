import { useCallback, useMemo, useState } from "react";

/**
 * Device-local per-instance view state. Everything here is ephemeral / per-device:
 * the active-instance selection, plus each instance's `{ query, expanded }`.
 *
 * Durable `sort`/`filter` live on the instance's config row (the config-backed
 * view model owns them) — they are NOT stored here. The reader stays tolerant of
 * legacy blobs that still carry `sort`/`filter` keys (they are simply ignored).
 *
 * State split (see CLAUDE.md):
 *   - active id           → `${storageKey}:active-view`   (device-local)
 *   - query + expand      → `${storageKey}:view-state`     (device-local)
 */

const ACTIVE_SUFFIX = ":active-view";
const STATE_SUFFIX = ":view-state";

interface LocalViewState {
  query: string;
  expanded: Record<string, boolean>;
}
type LocalMap = Record<string, LocalViewState>;

const EMPTY_LOCAL: LocalViewState = {
  query: "",
  expanded: {},
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

/** Parse the per-instance `{query, expanded}` map, tolerant of partial / legacy
 *  shapes (legacy `sort`/`filter` keys are ignored). */
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

export interface EphemeralViewState {
  /** Persisted active-instance id (null → caller falls back to defaultView). */
  activeViewId: string | null;
  setActiveView: (viewId: string) => void;
  /** Raw per-instance local blob — query/expanded (device-local). */
  localFor: (viewId: string) => LocalViewState;
  setQuery: (viewId: string, query: string) => void;
  setExpanded: (viewId: string, id: string, next: boolean) => void;
}

/**
 * Slim localStorage-only ephemeral state: active-id / query / expand. Durable
 * sort/filter live on the config row (owned by the config-backed view model).
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

  return useMemo(
    () => ({
      activeViewId,
      setActiveView,
      localFor,
      setQuery,
      setExpanded,
    }),
    [activeViewId, setActiveView, localFor, setQuery, setExpanded],
  );
}
