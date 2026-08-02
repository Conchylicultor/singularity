import { useCallback, useMemo, useState } from "react";
import type { ExpandChange } from "@plugins/primitives/plugins/tree/core";

/**
 * Per-instance **render** state: each instance's `{ query, expanded }`. The
 * active-instance selection is *model* state and lives in view-core
 * (`useActiveViewId`); durable `sort`/`filter` live on the instance's config row
 * (the config-backed engine owns them). The reader stays tolerant of legacy blobs
 * that still carry `sort`/`filter`/`query` keys (they are simply ignored).
 *
 * State split (see CLAUDE.md):
 *   - active id           → view-core `${storageKey}:active-view`   (device-local)
 *   - expand + collapse   → `${storageKey}:view-state`              (device-local)
 *   - query               → `${storageKey}:view-query`              (per browser tab)
 *
 * **The search query is deliberately NOT device-local.** Durable narrowings are
 * the config row's (sort / filter / group-by) and render as visible chips; a
 * query is an ad-hoc gesture that outlives its intent if it survives a browser
 * restart, leaving a filtered subset that reads as the view's whole contents.
 * `sessionStorage` keeps the only property worth persisting (an F5 does not lose
 * your place) while a new tab / browser restart start clean. Scope is the
 * *browser* tab (the `primitives/tab-id` precedent), not an app tab — two app
 * tabs on one surface share a query, exactly as they did before.
 */

const STATE_SUFFIX = ":view-state";
const QUERY_SUFFIX = ":view-query";

/** The durable half — device-local, survives a browser restart. */
interface LocalViewState {
  expanded: Record<string, boolean>;
  /** Collapsed group-by section keys (absence = expanded). */
  collapsedSections: string[];
}
type LocalMap = Record<string, LocalViewState>;

/** The transient half — one query per view instance, scoped to the browser tab. */
type QueryMap = Record<string, string>;

const EMPTY_LOCAL: LocalViewState = {
  expanded: {},
  collapsedSections: [],
};

/** What `localFor` hands back: the durable blob plus this tab's query. */
export interface ViewRenderState extends LocalViewState {
  query: string;
}

// ---------------------------------------------------------------------------
// Web Storage helpers (DOMException-guarded — private-mode / quota safe). The
// store is a parameter so the durable (local) and per-tab (session) halves share
// one guarded implementation and cannot drift in their failure handling.
// ---------------------------------------------------------------------------

function readString(store: Storage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch (err) {
    if (!(err instanceof DOMException)) throw err;
    return null;
  }
}

function writeString(store: Storage, key: string, value: string): void {
  try {
    store.setItem(key, value);
  } catch (err) {
    if (!(err instanceof DOMException)) throw err;
  }
}

/** Parse the per-instance `{expanded, collapsedSections}` map, tolerant of
 *  partial / legacy shapes. A legacy blob's `sort`/`filter`/`query` keys are
 *  ignored — so a query stranded in `localStorage` by the old device-local
 *  behavior is dropped on the next read rather than needing a migration. */
function readLocalMap(key: string): LocalMap {
  const raw = readString(localStorage, key);
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) return {};
  const out: LocalMap = {};
  for (const [viewId, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== "object" || v === null) continue;
    const r = v as Record<string, unknown>;
    out[viewId] = {
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

/** Parse the per-tab `viewId → query` map. */
function readQueryMap(key: string): QueryMap {
  const raw = readString(sessionStorage, key);
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) return {};
  const out: QueryMap = {};
  for (const [viewId, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === "string") out[viewId] = v;
  }
  return out;
}

export interface EphemeralViewState {
  /** Per-instance render state — expanded/collapsedSections (device-local) plus
   *  this browser tab's `query`. */
  localFor: (viewId: string) => ViewRenderState;
  setQuery: (viewId: string, query: string) => void;
  /** Apply a whole expand/collapse batch in ONE localStorage write. */
  setExpanded: (viewId: string, changes: readonly ExpandChange[]) => void;
  /** Collapse/expand a group-by section (device-local; absence = expanded). */
  setSectionCollapsed: (viewId: string, key: string, collapsed: boolean) => void;
}

/**
 * Slim Web-Storage ephemeral render state: expand/collapse in `localStorage`,
 * the search query in `sessionStorage`. Active-id lives in view-core; durable
 * sort/filter live on the config row.
 */
export function useViewEphemeral(storageKey: string): EphemeralViewState {
  const stateKey = `${storageKey}${STATE_SUFFIX}`;
  const queryKey = `${storageKey}${QUERY_SUFFIX}`;

  const [localMap, setLocalMap] = useState<LocalMap>(() =>
    readLocalMap(stateKey),
  );
  const [queryMap, setQueryMap] = useState<QueryMap>(() =>
    readQueryMap(queryKey),
  );

  const writeLocal = useCallback(
    (viewId: string, mutate: (prev: LocalViewState) => LocalViewState) => {
      setLocalMap((prev) => {
        const current = prev[viewId] ?? EMPTY_LOCAL;
        const next = { ...prev, [viewId]: mutate(current) };
        writeString(localStorage, stateKey, JSON.stringify(next));
        return next;
      });
    },
    [stateKey],
  );

  const localFor = useCallback(
    (viewId: string): ViewRenderState => ({
      ...(localMap[viewId] ?? EMPTY_LOCAL),
      query: queryMap[viewId] ?? "",
    }),
    [localMap, queryMap],
  );

  const setQuery = useCallback(
    (viewId: string, query: string) => {
      setQueryMap((prev) => {
        const next = { ...prev, [viewId]: query };
        writeString(sessionStorage, queryKey, JSON.stringify(next));
        return next;
      });
    },
    [queryKey],
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
