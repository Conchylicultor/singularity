import { useMemo } from "react";
import type { FieldDef } from "../../core";
import { isGroupableField } from "./use-data-view-sections";

export interface GroupByController<TRow> {
  /** The active group-by field id, or null when ungrouped. */
  groupBy: string | null;
  /** Set (or clear with `null`) the group-by field. */
  setGroupBy: (fieldId: string | null) => void;
  /** Fields eligible to group by (enum/bool by default; see `isGroupableField`). */
  groupableFields: FieldDef<TRow>[];
  /** The currently-active groupable field, or null. */
  activeField: FieldDef<TRow> | null;
}

/**
 * Builder-facing controller for the data-view group-by selection. Mirrors
 * `useSortController`/`useFilterController` exactly: reads the active id from
 * `groupBy`, writes back through `setGroupBy` (the host binds that to
 * `viewModel.setGroupBy(activeViewId, …)` → `updateView({ groupBy }, { merge: true })`).
 */
export function useGroupByController<TRow>(
  fields: FieldDef<TRow>[],
  groupBy: string | null,
  setGroupBy: (fieldId: string | null) => void,
): GroupByController<TRow> {
  const groupableFields = useMemo(
    () => fields.filter((f) => isGroupableField(f)),
    [fields],
  );

  // A dangling groupBy (field removed) resolves to no active field, so the UI
  // shows "None" without crashing — the row stays in config until re-grouped.
  const activeField = useMemo(
    () => groupableFields.find((f) => f.id === groupBy) ?? null,
    [groupableFields, groupBy],
  );

  return useMemo(
    () => ({ groupBy, setGroupBy, groupableFields, activeField }),
    [groupBy, setGroupBy, groupableFields, activeField],
  );
}
