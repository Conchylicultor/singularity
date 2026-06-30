import { useMemo } from "react";
import type { FieldDef } from "../../core";

export interface VisibleFieldItem<TRow> {
  field: FieldDef<TRow>;
  visible: boolean;
}

export interface VisibleFieldsController<TRow> {
  /** Ordered rows for the Properties list: visible fields first (in body order),
   *  then the hidden fields appended (in schema order). */
  items: VisibleFieldItem<TRow>[];
  /** The raw per-instance policy (null = unconfigured / show-all). */
  visibleFields: string[] | null;
  /** Toggle a field's visibility; materializes the explicit array on first edit. */
  toggle: (id: string) => void;
  /** Reorder a field to `toIndex` within the `items` list. */
  move: (id: string, toIndex: number) => void;
  /** Reset to show-all (null) — every field shown, incl. later-added ones. */
  showAll: () => void;
  /** True once an explicit array is stored (i.e. customized away from show-all). */
  isCustomized: boolean;
}

/** arrayMove(items, from, to) — pure, immutable reorder. */
function arrayMove<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}

/**
 * Builder-facing controller for the per-view-instance visible-fields list
 * (Notion "Properties"). Mirrors `useSortController`'s shape (memoized facade,
 * flat): every action computes the next ordered `items` immutably, then commits
 * `items.filter(visible).map(id)` through `setVisibleFields` (the host binds that
 * to `setVisibleFields(activeViewId, …)` → `updateView({ visibleFields }, { merge: true })`).
 *
 * `null` (unconfigured) renders every field checked in schema order; the first
 * `toggle`/`move` materializes the explicit array. `showAll()` resets to `null`.
 */
export function useVisibleFieldsController<TRow>(
  fields: FieldDef<TRow>[],
  visibleFields: string[] | null,
  setVisibleFields: (ids: string[] | null) => void,
): VisibleFieldsController<TRow> {
  // The ordered display list. Unconfigured (`null`) → every field checked, schema
  // order. Explicit array → the visible ids first (in stored order, dropping ids
  // the schema no longer carries), then the remaining (hidden) fields appended in
  // schema order — so a hidden field stays reachable in the Properties list.
  const items = useMemo<VisibleFieldItem<TRow>[]>(() => {
    if (visibleFields == null) {
      return fields.map((field) => ({ field, visible: true }));
    }
    const byId = new Map(fields.map((f) => [f.id, f]));
    const visibleSet = new Set(visibleFields);
    const ordered: VisibleFieldItem<TRow>[] = [];
    for (const id of visibleFields) {
      const field = byId.get(id);
      if (field) ordered.push({ field, visible: true });
    }
    for (const field of fields) {
      if (!visibleSet.has(field.id)) ordered.push({ field, visible: false });
    }
    return ordered;
  }, [fields, visibleFields]);

  const isCustomized = visibleFields != null;

  return useMemo(() => {
    // Commit the visible ids in `next` list order — the single write path.
    const commit = (next: VisibleFieldItem<TRow>[]) =>
      setVisibleFields(next.filter((i) => i.visible).map((i) => i.field.id));

    const toggle = (id: string) => {
      commit(
        items.map((i) =>
          i.field.id === id ? { ...i, visible: !i.visible } : i,
        ),
      );
    };
    const move = (id: string, toIndex: number) => {
      const from = items.findIndex((i) => i.field.id === id);
      if (from === -1 || from === toIndex) return;
      commit(arrayMove(items, from, toIndex));
    };
    const showAll = () => setVisibleFields(null);

    return {
      items,
      visibleFields,
      toggle,
      move,
      showAll,
      isCustomized,
    };
  }, [items, visibleFields, setVisibleFields, isCustomized]);
}
