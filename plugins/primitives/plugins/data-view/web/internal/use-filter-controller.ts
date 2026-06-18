import { useMemo } from "react";
import type {
  FieldDef,
  FilterGroup,
  FilterNode,
  FilterOperatorSet,
} from "../../core";
import { useResolveOperatorSet } from "../filter-slot";
import { isRuleActive } from "./rule-resolution";

export interface FilterController<TRow> {
  /** The active view's filter tree (null when no filter). */
  filter: FilterGroup | null;
  /** Replace the whole filter tree (null clears it). */
  setFilter: (filter: FilterGroup | null) => void;
  /** Schema fields whose type chain resolves an operator set (i.e. filterable). */
  filterableFields: FieldDef<TRow>[];
  /** Resolve a field type id → its operator set (honors `extends`). */
  resolveOperatorSet: (typeId: string) => FilterOperatorSet | undefined;
  /** Count of *active* rules in the tree — rules that resolve and are complete
   *  per the operator (shared `isRuleActive`, the same gate the evaluator uses),
   *  so the chip count and what actually filters can never disagree. */
  ruleCount: number;
}

function countCompleteRules<TRow>(
  node: FilterNode,
  fields: FieldDef<TRow>[],
  resolveOperatorSet: (typeId: string) => FilterOperatorSet | undefined,
): number {
  if (node.kind === "group") {
    return node.children.reduce(
      (sum, child) =>
        sum + countCompleteRules(child, fields, resolveOperatorSet),
      0,
    );
  }
  return isRuleActive(node, fields, resolveOperatorSet) ? 1 : 0;
}

/**
 * Builder-facing controller for the data-view filter tree. Phase 1 wires this in
 * `<DataView>`; Phase 2's popover builder consumes the full surface (filter,
 * setFilter, filterableFields, resolveOperatorSet, ruleCount).
 */
export function useFilterController<TRow>(
  fields: FieldDef<TRow>[],
  filter: FilterGroup | null,
  setFilter: (filter: FilterGroup | null) => void,
): FilterController<TRow> {
  const resolveOperatorSet = useResolveOperatorSet();

  const filterableFields = useMemo(
    () =>
      fields.filter((f) => resolveOperatorSet(f.type ?? "text") !== undefined),
    [fields, resolveOperatorSet],
  );

  const ruleCount = useMemo(
    () => (filter ? countCompleteRules(filter, fields, resolveOperatorSet) : 0),
    [filter, fields, resolveOperatorSet],
  );

  return useMemo(
    () => ({
      filter,
      setFilter,
      filterableFields,
      resolveOperatorSet,
      ruleCount,
    }),
    [filter, setFilter, filterableFields, resolveOperatorSet, ruleCount],
  );
}
