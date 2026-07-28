import { useCallback, useMemo, useState } from "react";
import type { ExpandChange } from "@plugins/primitives/plugins/tree/core";

/**
 * Device-local per-instance **render** state: each instance's `{ query, expanded }`.
 * The active-instance selection is *model* state and lives in view-core
 * (`useActiveViewId`); durable `sort`/`filter` live on the instance's config row
 * (the config-backed engine owns them). The reader stays tolerant of legacy blobs
 * that still carry `sort`/`filter` keys (they are simply ignored).
 *
 * State split (see CLAUDE.md):
 *   - active id           → view-core `${storageKey}:active-view`   (device-local)
 *   - query + expand      → `${storageKey}:view-state`              (device-local)
 */

const STATE_SUFFIX = ":view-state";

interface LocalViewState {
  query: string;
  expanded: Record<string, boolean>;
  /** Collapsed group-by section keys (absence = expanded). */
  collapsedSections: string[];
}
type LocalMap = Record<string, LocalViewState>;

const EMPTY_LOCAL: LocalViewState = {
  query: "",
  expanded: {},
  collapsedSections: [],
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
      collapsedSections: Array.isArray(r.collapsedSections)
        ? (r.collapsedSections as string[]).filter((k) => typeof k === "string")
        : [],
    };
  }
  return out;
}

export interface EphemeralViewState {
  /** Raw per-instance local blob — query/expanded/collapsedSections (device-local). */
  localFor: (viewId: string) => LocalViewState;
  setQuery: (viewId: string, query: string) => void;
  /** Apply a whole expand/collapse batch in ONE localStorage write. */
  setExpanded: (viewId: string, changes: readonly ExpandChange[]) => void;
  /** Collapse/expand a group-by section (device-local; absence = expanded). */
  setSectionCollapsed: (viewId: string, key: string, collapsed: boolean) => void;
}

/**
 * Slim localStorage-only ephemeral render state: query / expand. Active-id lives
 * in view-core; durable sort/filter live on the config row.
 */
export function useViewEphemeral(storageKey: string): EphemeralViewState {
  const stateKey = `${storageKey}${STATE_SUFFIX}`;

  const [localMap, setLocalMap] = useState<LocalMap>(() =>
    readLocalMap(stateKey),
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
    (viewId: string, changes: readonly ExpandChange[]) => {
      if (changes.length === 0) return;
      // `writeLocal` JSON.stringifies the WHOLE per-surface map, so the batch
      // must land in a single mutate: a per-row call would re-serialize a map
      // growing to N keys N times — quadratic on expand-all over a large tree.
      writeLocal(viewId, (prev) => {
        const expanded = { ...prev.expanded };
        for (const c of changes) expanded[c.id] = c.expanded;
        return { ...prev, expanded };
      });
    },
    [writeLocal],
  );

  const setSectionCollapsed = useCallback(
    (viewId: string, key: string, collapsed: boolean) => {
      writeLocal(viewId, (prev) => {
        const set = new Set(prev.collapsedSections);
        if (collapsed) set.add(key);
        else set.delete(key);
        return { ...prev, collapsedSections: [...set] };
      });
    },
    [writeLocal],
  );

  return useMemo(
    () => ({ localFor, setQuery, setExpanded, setSectionCollapsed }),
    [localFor, setQuery, setExpanded, setSectionCollapsed],
  );
}
