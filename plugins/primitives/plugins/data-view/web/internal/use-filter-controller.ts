import { useMemo } from "react";
import type {
  FieldDef,
  FilterGroup,
  FilterNode,
  FilterOperatorSet,
} from "../../core";
import { useResolveOperatorSet } from "../filter-slot";

export interface FilterController<TRow> {
  /** The active view's filter tree (null when no filter). */
  filter: FilterGroup | null;
  /** Replace the whole filter tree (null clears it). */
  setFilter: (filter: FilterGroup | null) => void;
  /** Schema fields whose type chain resolves an operator set (i.e. filterable). */
  filterableFields: FieldDef<TRow>[];
  /** Resolve a field type id → its operator set (honors `extends`). */
  resolveOperatorSet: (typeId: string) => FilterOperatorSet | undefined;
  /** Count of COMPLETE rules in the tree (field + operator resolved; value
   *  present when the operator's `hasValue` is true). */
  ruleCount: number;
}

/** True when `value` is a present operand (not null/undefined/""/[]). */
function hasOperand(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
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
  const field = fields.find((f) => f.id === node.fieldId);
  if (!field) return 0;
  const opSet = resolveOperatorSet(field.type ?? "text");
  const op = opSet?.operators.find((o) => o.id === node.operatorId);
  if (!op) return 0;
  if (op.hasValue && !hasOperand(node.value)) return 0;
  return 1;
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
