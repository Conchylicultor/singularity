import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SealContributions } from "@plugins/framework/plugins/web-sdk/core";
import type { ConfigDescriptor } from "@plugins/config_v2/core";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { Rank } from "@plugins/primitives/plugins/rank/web";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import type { VariantValue } from "@plugins/fields/plugins/variant/core";
import type { ViewConfigRow, ViewTypeMeta } from "../../core";
import { buildInstanceFromRow } from "./resolve-instances";
import type { ResolvedViewInstance } from "./resolve-instances";

/** Trailing-edge debounce for config writes — `setConfig` POSTs the whole doc. */
const WRITE_DEBOUNCE_MS = 400;

/** What the config engine exposes to the host. Opaque about the per-instance
 *  `options` blob — it never names `sort`/`filter`; the host layers those on. */
export interface ViewsConfigHandle {
  /** Resolved, ordered instances (fail-soft skip of orphan / hierarchical rows). */
  instances: ResolvedViewInstance[];
  /** The RAW `view` value for one instance (the variant blob `{ type, ...opts }`),
   *  read straight off the config row (NOT the merged code+config options). For a
   *  not-yet-materialized default it returns the seed `{ type }` so callers always
   *  have a `type` to merge over. `undefined` only when the id is unknown. */
  viewFor: (id: string) => VariantValue | undefined;
  /** Write a new `view` value for one instance. `{ merge: true }` shallow-merges
   *  over the existing raw view (`{ ...prev, ...view }`), preserving any
   *  host-injected keys the caller didn't carry; default replaces wholesale. */
  updateView: (id: string, view: VariantValue, opts?: { merge?: boolean }) => void;
  addView: (type: string) => string;
  renameView: (id: string, name: string) => void;
  duplicateView: (id: string) => string;
  deleteView: (id: string) => void;
  reorderView: (id: string, toIndex: number) => void;
}

/** Stable random id for new config rows (the listField also injects one on the
 *  server, but we need one client-side for the optimistic mirror). */
function newId(): string {
  return `view-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * A raw config row as authored on disk. Config is the single source of truth and
 * the authored shape is **terse** — only `{ name, view }` is required; `id` and
 * `rank` are optional and derived on read (see `normalizeRows`). This lets an
 * agent hand-write `{ "name": "All", "view": { "type": "table" } }` rows without
 * inventing ids or fractional ranks.
 */
interface RawViewRow {
  id?: string;
  rank?: string;
  name: string;
  view: VariantValue;
}

/** Slugify a name into a filename/id-safe token (`"My View" → "my-view"`). */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Normalize raw (possibly terse) config rows into fully-formed `ViewConfigRow`s:
 * derive `id` (explicit `id` ?? slug(name) ?? `view-${index}`) and `rank`
 * (explicit `rank` ?? a generated `Rank.between` sequence following array order).
 * Config is the ONLY source — there is no code synthesis. Duplicate derived ids
 * are disambiguated with an index suffix so each row stays addressable.
 */
function normalizeRows(raw: RawViewRow[]): ViewConfigRow[] {
  const seenIds = new Set<string>();
  let prevRank: Rank | null = null;
  return raw.map((row, i) => {
    let id = row.id ?? slugify(row.name) ?? `view-${i}`;
    if (id === "") id = `view-${i}`;
    while (seenIds.has(id)) id = `${id}-${i}`;
    seenIds.add(id);
    let rank: string;
    if (row.rank != null) {
      rank = row.rank;
      prevRank = Rank.from(row.rank);
    } else {
      const next = Rank.between(prevRank, null);
      prevRank = next;
      rank = next.toString();
    }
    return { id, rank, name: row.name, view: row.view };
  });
}

/**
 * Generic opaque-options config engine. Reads the supplied descriptor
 * (app-scoped), keeps an optimistic mirror, and debounces
 * `setConfig("views", next)`. Mirrors the proven pendingRef / timerRef / flush /
 * scheduleWrite / flush-on-unmount pattern.
 *
 * **Config is the single source of truth.** There is NO code synthesis of
 * default view-instances: the displayed instances come *only* from the authored
 * `config.views` rows. Authored rows may be **terse** (`{ name, view }`); `id`
 * and `rank` are derived on read (`normalizeRows`). When config has zero rows the
 * engine returns an empty instance list and the host renders a placeholder. The
 * build-time `data-view:configs-authored` check is the forcing function that an
 * agent author the config.
 *
 * The engine treats each row's `view` as an **opaque `VariantValue`** — it never
 * reads or writes `sort`/`filter`. The host layers those on through `viewFor` +
 * `updateView({ merge: true })`.
 */
export function useViewsConfig<T extends ViewTypeMeta>(
  storageKey: string,
  descriptorMap: Map<string, ConfigDescriptor>,
  contributions: SealContributions<T>[],
  hasHierarchy: boolean,
  viewOptions: Record<string, unknown> | undefined,
): ViewsConfigHandle {
  // Resolve the descriptor via the supplied map (reference identity against the
  // registered `ConfigV2.WebRegister` descriptor). A missing id means the marker
  // wasn't scraped into the consumer's manifest — fail loud rather than hand
  // `useConfig` an undefined descriptor (which throws opaquely downstream).
  const descriptor = descriptorMap.get(storageKey);
  if (!descriptor) {
    throw new Error(
      `view-core: no registered descriptor for storageKey "${storageKey}". ` +
        `Declare it (e.g. defineDataView("${storageKey}")) under the plugin's ` +
        `web/ and run \`./singularity build\` to regenerate the manifest.`,
    );
  }
  // No `scopeId`: runtime per-instance edits write to the user-global layer
  // (mirroring reorder's `setConfig("items", …)`). view-core is a PRIMITIVE and
  // stays app-agnostic — it never reaches for the current appId. The
  // per-`storageKey` descriptor already scopes views to one surface; if per-app
  // config is ever wanted, thread a `scopeId` in as a prop (config_v2 scoped
  // read/write is symmetric now — fork-on-write makes the scope exist on first
  // write — so a threaded scopeId would persist and read back correctly).
  const config = useConfig(descriptor);
  const setConfig = useSetConfig(descriptor);

  // Raw (possibly terse) rows straight off the config doc. `id`/`rank` are
  // derived on read so the authored file can stay terse (`{ name, view }`).
  const configRows = (config.views as RawViewRow[] | undefined) ?? [];

  // Optimistic mirror of the normalized persisted rows. Config is the single
  // source — an empty config means **no views** (the host renders a
  // placeholder), never synthesized defaults.
  const [mirror, setMirror] = useState<ViewConfigRow[]>(() =>
    normalizeRows(configRows),
  );

  // Freshest setConfig + key for the debounced flush.
  const setConfigRef = useLatestRef(setConfig);

  const pendingRef = useRef<ViewConfigRow[] | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `flush` stays referentially stable (scheduleWrite + the unmount effect depend
  // on it) and writes through the freshest setConfig off the stable
  // `setConfigRef.current`.
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
  // pending write. JSON identity guards against re-render thrash. Incoming rows
  // are normalized (terse → full) — an empty config normalizes to `[]`.
  const configJson = JSON.stringify(configRows);
  useEffect(() => {
    if (pendingRef.current !== null) return;
    setMirror((prev) => {
      const incoming = normalizeRows(JSON.parse(configJson) as RawViewRow[]);
      return JSON.stringify(prev) === JSON.stringify(incoming) ? prev : incoming;
    });
    // configRows is derived from configJson; depend on the string only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configJson]);

  // Flush any pending durable write on unmount.
  useEffect(() => () => flush(), [flush]);

  /** Apply `mutate` against the current (normalized) rows, then optimistically
   *  mirror + schedule the write. The first UI edit thus materializes from the
   *  authored rows (or empty) — never from code. */
  const applyMutation = useCallback(
    (mutate: (rows: ViewConfigRow[]) => ViewConfigRow[]) => {
      setMirror((prev) => {
        const next = mutate(prev);
        scheduleWrite(next);
        return next;
      });
    },
    [scheduleWrite],
  );

  // The rows actually displayed: the normalized mirror (config is the only
  // source — no synthesized seed).
  const displayRows = mirror;

  // Sort by rank, then resolve each row through the contribution registry.
  const instances = useMemo<ResolvedViewInstance<T>[]>(() => {
    const sorted = [...displayRows].sort((a, b) =>
      Rank.compare(Rank.from(a.rank), Rank.from(b.rank)),
    );
    return sorted
      .map((row) =>
        buildInstanceFromRow(row, contributions, hasHierarchy, viewOptions),
      )
      .filter((r): r is ResolvedViewInstance<T> => r !== null);
  }, [displayRows, contributions, hasHierarchy, viewOptions]);

  const rowById = useCallback(
    (id: string): ViewConfigRow | undefined =>
      displayRows.find((r) => r.id === id),
    [displayRows],
  );

  // The RAW view value off the config row (NOT the merged code+config options),
  // so writes never persist code-only `viewOptions` keys (e.g. gallery's
  // `renderCard`). For an unknown id → undefined; the row always has a `type`
  // (the seed sets `{ type }`), so a merge spread always carries a type.
  const viewFor = useCallback(
    (id: string): VariantValue | undefined => rowById(id)?.view,
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

  const updateView = useCallback(
    (id: string, view: VariantValue, opts?: { merge?: boolean }) => {
      // merge → shallow-merge over the existing raw view, preserving any
      // host-injected keys (sort/filter/future) the caller didn't carry. The
      // incoming `view` always carries `type`, so a type change overwrites
      // `type` + its options; stale old-type keys linger inert (same as before).
      // Default → replace wholesale.
      mergeView(id, (prev) => (opts?.merge ? { ...prev, ...view } : view));
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
      viewFor,
      updateView,
      addView,
      renameView,
      duplicateView,
      deleteView,
      reorderView,
    }),
    [
      instances,
      viewFor,
      updateView,
      addView,
      renameView,
      duplicateView,
      deleteView,
      reorderView,
    ],
  );
}
