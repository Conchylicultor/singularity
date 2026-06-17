import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SealContributions } from "@plugins/framework/plugins/web-sdk/core";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { Rank } from "@plugins/primitives/plugins/rank/web";
import type { VariantValue } from "@plugins/fields/plugins/variant/core";
import type { FilterGroup, SortState } from "../../core";
import type { DataViewContribution } from "../slots";
import { viewsDescriptor } from "../../shared/views-config";
import { buildInstanceFromRow, type ViewConfigRow } from "./resolve-instances";
import type { ResolvedViewInstance } from "./resolve-instances";

/** Trailing-edge debounce for config writes — `setConfig` POSTs the whole doc. */
const WRITE_DEBOUNCE_MS = 400;

/** What a config-mode view model exposes to the host. */
export interface ViewsConfigHandle {
  /** Resolved, ordered instances (fail-soft skip of orphan / hierarchical rows). */
  instances: ResolvedViewInstance[];
  /** sort/filter for one instance, read off its config row. */
  sortFor: (id: string) => SortState | null;
  filterFor: (id: string) => FilterGroup | null;
  setSort: (id: string, fieldId: string) => void;
  setFilter: (id: string, filter: FilterGroup | null) => void;
  addView: (type: string) => string;
  renameView: (id: string, name: string) => void;
  duplicateView: (id: string) => string;
  deleteView: (id: string) => void;
  reorderView: (id: string, toIndex: number) => void;
  updateView: (id: string, view: VariantValue) => void;
}

/** Stable random id for new config rows (the listField also injects one on the
 *  server, but we need one client-side for the optimistic mirror). */
function newId(): string {
  return `view-${Math.random().toString(36).slice(2, 10)}`;
}

/** Read the host-managed sort/filter keys off a row's variant value. */
function readSort(view: VariantValue): SortState | null {
  return (view.sort as SortState | null | undefined) ?? null;
}
function readFilter(view: VariantValue): FilterGroup | null {
  return (view.filter as FilterGroup | null | undefined) ?? null;
}

/**
 * Config-mode engine. Reads `viewsDescriptor(storageKey)` (app-scoped), keeps an
 * optimistic mirror, and debounces `setConfig("views", next)`. Mirrors the proven
 * pendingRef / timerRef / flush / scheduleWrite / flush-on-unmount pattern.
 *
 * **Materialize-on-first-edit**: while the config list is empty we *display* the
 * synthesized defaults (passed in), but never write them. The first mutating
 * action seeds the persisted list with those defaults and then applies the
 * mutation — exactly like reorder's "unlisted live contributions materialize on
 * first edit".
 */
export function useViewsConfig(
  storageKey: string,
  contributions: SealContributions<DataViewContribution>[],
  hasHierarchy: boolean,
  defaults: ResolvedViewInstance[],
): ViewsConfigHandle {
  const descriptor = viewsDescriptor(storageKey);
  // No `scopeId`: runtime per-instance edits write to the user-global layer
  // (mirroring reorder's `setConfig("items", …)`). An `app:` scopeId would write
  // to a scope key the read path ignores until the scope is forked, silently
  // dropping every edit on reload. The per-`storageKey` descriptor already scopes
  // views to one surface; per-app forking stays a Settings-pane concern.
  const config = useConfig(descriptor);
  const setConfig = useSetConfig(descriptor);

  const configRows = (config.views as ViewConfigRow[] | undefined) ?? [];

  // Optimistic mirror of the persisted rows. `null` → "not yet materialized";
  // we display synthesized defaults until the first edit seeds real rows.
  const [mirror, setMirror] = useState<ViewConfigRow[] | null>(() =>
    configRows.length > 0 ? configRows : null,
  );

  // Freshest setConfig + key for the debounced flush.
  const setConfigRef = useRef(setConfig);
  setConfigRef.current = setConfig;

  const pendingRef = useRef<ViewConfigRow[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const next = pendingRef.current;
    if (next === null) return;
    pendingRef.current = null;
    setConfigRef.current("views", next);
  }, []);

  const scheduleWrite = useCallback(
    (next: ViewConfigRow[]) => {
      pendingRef.current = next;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, WRITE_DEBOUNCE_MS);
    },
    [flush],
  );

  // Reconcile the mirror from config when external truth advances and we have no
  // pending write. JSON identity guards against re-render thrash.
  const configJson = JSON.stringify(configRows);
  useEffect(() => {
    if (pendingRef.current !== null) return;
    setMirror((prev) => {
      const incoming: ViewConfigRow[] = JSON.parse(configJson);
      if (incoming.length === 0) {
        // Config empty → stay un-materialized (display defaults).
        return prev === null ? prev : null;
      }
      return JSON.stringify(prev) === configJson ? prev : incoming;
    });
    // configRows is derived from configJson; depend on the string only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configJson]);

  // Flush any pending durable write on unmount.
  useEffect(() => () => flush(), [flush]);

  // Synthesize seed rows from the displayed defaults (materialize-on-first-edit).
  // IDs are **deterministic** (`default:<type>:<index>`) so the un-materialized
  // displayRows stay referentially stable across renders (no random-id thrash)
  // and the device-local active-id survives reloads before the first edit. These
  // ids are unique within the list and persist verbatim on first edit.
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;
  const seedRows = useCallback((): ViewConfigRow[] => {
    let prevRank: Rank | null = null;
    return defaultsRef.current.map((d, i) => {
      const rank = Rank.between(prevRank, null);
      prevRank = rank;
      return {
        id: `default:${d.instance.type}:${i}`,
        rank: rank.toString(),
        name: d.instance.name,
        view: { type: d.instance.type } as VariantValue,
      };
    });
  }, []);

  /** Apply `mutate` against the current rows (materializing from defaults if the
   *  list is still empty), then optimistically mirror + schedule the write. */
  const applyMutation = useCallback(
    (mutate: (rows: ViewConfigRow[]) => ViewConfigRow[]) => {
      setMirror((prev) => {
        const base = prev ?? seedRows();
        const next = mutate(base);
        scheduleWrite(next);
        return next;
      });
    },
    [scheduleWrite, seedRows],
  );

  // The rows actually displayed: the materialized mirror, else synthesized seed
  // (display-only, not persisted) so the switcher shows defaults pre-edit. Stable
  // across renders while un-materialized because seed ids are deterministic.
  const displayRows = useMemo(
    () => mirror ?? seedRows(),
    [mirror, seedRows],
  );

  // Sort by rank, then resolve each row through the contribution registry.
  const instances = useMemo<ResolvedViewInstance[]>(() => {
    const sorted = [...displayRows].sort((a, b) =>
      Rank.compare(Rank.from(a.rank), Rank.from(b.rank)),
    );
    return sorted
      .map((row) => buildInstanceFromRow(row, contributions, hasHierarchy))
      .filter((r): r is ResolvedViewInstance => r !== null);
  }, [displayRows, contributions, hasHierarchy]);

  const rowById = useCallback(
    (id: string): ViewConfigRow | undefined =>
      displayRows.find((r) => r.id === id),
    [displayRows],
  );

  const sortFor = useCallback(
    (id: string): SortState | null => {
      const row = rowById(id);
      return row ? readSort(row.view) : null;
    },
    [rowById],
  );
  const filterFor = useCallback(
    (id: string): FilterGroup | null => {
      const row = rowById(id);
      return row ? readFilter(row.view) : null;
    },
    [rowById],
  );

  const mergeView = useCallback(
    (id: string, patch: (view: VariantValue) => VariantValue) => {
      applyMutation((rows) =>
        rows.map((r) => (r.id === id ? { ...r, view: patch(r.view) } : r)),
      );
    },
    [applyMutation],
  );

  const setSort = useCallback(
    (id: string, fieldId: string) => {
      mergeView(id, (view) => {
        const cur = readSort(view);
        // null → asc → desc → null cycle (matches use-data-table.toggleSort).
        let sort: SortState | null;
        if (cur?.fieldId !== fieldId) sort = { fieldId, direction: "asc" };
        else if (cur.direction === "asc") sort = { fieldId, direction: "desc" };
        else sort = null;
        return { ...view, sort };
      });
    },
    [mergeView],
  );

  const setFilter = useCallback(
    (id: string, filter: FilterGroup | null) => {
      mergeView(id, (view) => ({ ...view, filter }));
    },
    [mergeView],
  );

  const updateView = useCallback(
    (id: string, view: VariantValue) => {
      // Replace the whole `view`, but preserve the host-managed sort/filter that
      // the options sub-form doesn't carry.
      mergeView(id, (prev) => ({
        ...view,
        sort: readSort(prev),
        filter: readFilter(prev),
      }));
    },
    [mergeView],
  );

  const renameView = useCallback(
    (id: string, name: string) => {
      applyMutation((rows) =>
        rows.map((r) => (r.id === id ? { ...r, name } : r)),
      );
    },
    [applyMutation],
  );

  const addView = useCallback(
    (type: string): string => {
      const id = newId();
      applyMutation((rows) => {
        const sorted = [...rows].sort((a, b) =>
          Rank.compare(Rank.from(a.rank), Rank.from(b.rank)),
        );
        const last = sorted.at(-1);
        const rank = Rank.between(
          last ? Rank.from(last.rank) : null,
          null,
        ).toString();
        const contribution = contributions.find((c) => c.type === type);
        return [
          ...rows,
          {
            id,
            rank,
            name: contribution?.title ?? type,
            view: { type } as VariantValue,
          },
        ];
      });
      return id;
    },
    [applyMutation, contributions],
  );

  const duplicateView = useCallback(
    (id: string): string => {
      const newRowId = newId();
      applyMutation((rows) => {
        const sorted = [...rows].sort((a, b) =>
          Rank.compare(Rank.from(a.rank), Rank.from(b.rank)),
        );
        const idx = sorted.findIndex((r) => r.id === id);
        if (idx < 0) return rows;
        const src = sorted[idx]!;
        const next = sorted[idx + 1];
        const rank = Rank.between(
          Rank.from(src.rank),
          next ? Rank.from(next.rank) : null,
        ).toString();
        return [
          ...rows,
          {
            id: newRowId,
            rank,
            name: `${src.name} copy`,
            // Deep-ish clone of the variant value (JSON-safe by construction).
            view: JSON.parse(JSON.stringify(src.view)) as VariantValue,
          },
        ];
      });
      return newRowId;
    },
    [applyMutation],
  );

  const deleteView = useCallback(
    (id: string) => {
      applyMutation((rows) => rows.filter((r) => r.id !== id));
    },
    [applyMutation],
  );

  const reorderView = useCallback(
    (id: string, toIndex: number) => {
      applyMutation((rows) => {
        const sorted = [...rows].sort((a, b) =>
          Rank.compare(Rank.from(a.rank), Rank.from(b.rank)),
        );
        const fromIndex = sorted.findIndex((r) => r.id === id);
        if (fromIndex < 0 || fromIndex === toIndex) return rows;
        const moved = sorted[fromIndex]!;
        const without = sorted.filter((r) => r.id !== id);
        const clamped = Math.max(0, Math.min(toIndex, without.length));
        const before = without[clamped - 1];
        const after = without[clamped];
        const rank = Rank.between(
          before ? Rank.from(before.rank) : null,
          after ? Rank.from(after.rank) : null,
        ).toString();
        return rows.map((r) => (r.id === id ? { ...moved, rank } : r));
      });
    },
    [applyMutation],
  );

  return useMemo(
    () => ({
      instances,
      sortFor,
      filterFor,
      setSort,
      setFilter,
      addView,
      renameView,
      duplicateView,
      deleteView,
      reorderView,
      updateView,
    }),
    [
      instances,
      sortFor,
      filterFor,
      setSort,
      setFilter,
      addView,
      renameView,
      duplicateView,
      deleteView,
      reorderView,
      updateView,
    ],
  );
}
