import { useMemo } from "react";
import type { FieldDef, FieldGroupingSet, GroupByRule } from "../../core";
import { useGroupingRegistry } from "../grouping-slot";
import { isGroupableField } from "./use-data-view-sections";

export interface GroupByController<TRow> {
  /** The active group-by rule, or null when ungrouped. */
  groupBy: GroupByRule | null;
  /** Write (or clear with `null`) the whole rule. The raw write-back; a picker
   *  usually wants `setField` / `setGrouping`, which resolve intent into one. */
  setGroupBy: (rule: GroupByRule | null) => void;
  /**
   * Pick the field to group by (`null` = ungrouped), resolving the granularity
   * itself: the previously-chosen grouping when the new field's type still
   * offers it, else that type's FIRST choice. So picking a date field lands on
   * "Smart" and persists `"smart"` — never a grouping id the config names but
   * the type does not have.
   */
  setField: (fieldId: string | null) => void;
  /** Fields eligible to group by — those whose TYPE declares how it buckets,
   *  plus anything opting in with `groupable: true` (see `isGroupableField`). */
  groupableFields: FieldDef<TRow>[];
  /** The currently-active groupable field, or null. */
  activeField: FieldDef<TRow> | null;
  /** The active field's granularity band (section label + choices), or null when
   *  ungrouped. A type declaring none falls back to the identity grouping, so
   *  this is null only when there is no active field. */
  groupings: FieldGroupingSet | null;
  /** The active grouping's id — the persisted one, or the first choice when the
   *  persisted id dangles. Null when ungrouped. */
  groupingId: string | null;
  /** Switch granularity within the active field. No-op when ungrouped. */
  setGrouping: (groupingId: string) => void;
}

/**
 * Builder-facing controller for the data-view group-by selection. Mirrors
 * `useSortController`/`useFilterController`: reads the active rule from
 * `groupBy`, writes back through `setGroupBy` (the host binds that to
 * `viewModel.setGroupBy(activeViewId, …)` → `updateView({ groupBy }, { merge: true })`).
 *
 * It reads the `Grouping` registry itself rather than taking a predicate: it is
 * a hook, the registry read is a hook, and the two questions it asks the
 * registry ("which fields can group?" and "how does this one bucket?") must be
 * answered from the same contributions or the picker could offer a field whose
 * granularity band it then cannot draw.
 */
export function useGroupByController<TRow>(
  fields: FieldDef<TRow>[],
  groupBy: GroupByRule | null,
  setGroupBy: (rule: GroupByRule | null) => void,
): GroupByController<TRow> {
  const registry = useGroupingRegistry();
  const groupableFields = useMemo(
    () => fields.filter((f) => isGroupableField(f, registry.has)),
    [fields, registry],
  );

  // A dangling groupBy (field removed) resolves to no active field, so the UI
  // shows "None" without crashing — the row stays in config until re-grouped.
  const activeField = useMemo(
    () => groupableFields.find((f) => f.id === groupBy?.fieldId) ?? null,
    [groupableFields, groupBy],
  );

  const groupings = useMemo(
    () => (activeField ? registry.setFor(activeField.type ?? "text") : null),
    [activeField, registry],
  );

  // The same tolerance one level down: a persisted `groupingId` the type no
  // longer offers (its groupings changed under the config) resolves to the first
  // choice rather than leaving the band with nothing checked.
  const groupingId = useMemo(() => {
    if (!groupings || !groupBy) return null;
    return (
      groupings.groupings.find((g) => g.id === groupBy.groupingId)?.id ??
      groupings.groupings[0]?.id ??
      null
    );
  }, [groupings, groupBy]);

  return useMemo(
    () => ({
      groupBy,
      setGroupBy,
      groupableFields,
      activeField,
      groupings,
      groupingId,
      setField: (fieldId: string | null) => {
        if (fieldId === null) {
          setGroupBy(null);
          return;
        }
        const field = groupableFields.find((f) => f.id === fieldId);
        const choices = registry.setFor(field?.type ?? "text").groupings;
        const kept = choices.find((g) => g.id === groupBy?.groupingId);
        const next = kept ?? choices[0];
        // `setFor` always answers with at least the identity grouping, so an
        // empty `choices` is unreachable — but a `find` that returned nothing
        // would silently write `undefined`, so state the floor.
        if (!next) {
          throw new Error(
            `[data-view] field type "${field?.type ?? "text"}" resolved to zero groupings`,
          );
        }
        setGroupBy({ fieldId, groupingId: next.id });
      },
      setGrouping: (nextGroupingId: string) => {
        if (!groupBy) return;
        setGroupBy({ fieldId: groupBy.fieldId, groupingId: nextGroupingId });
      },
    }),
    [
      groupBy,
      setGroupBy,
      groupableFields,
      activeField,
      groupings,
      groupingId,
      registry,
    ],
  );
}
