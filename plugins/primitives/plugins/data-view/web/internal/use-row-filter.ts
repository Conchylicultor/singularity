import { useMemo } from "react";
import type { FieldDef, FilterGroup, FilterOperatorSet } from "../../core";
import { lowerFilterGroup, makeRowMatcher } from "./evaluate-filter";
import { useFilterClock } from "./use-filter-clock";

/**
 * A DataView filter tree as a row predicate, for in-memory filtering: lowered
 * once into the filter language (`lowerFilterGroup`) and matched per row
 * (`makeRowMatcher`). `null` when the tree constrains nothing (no filter, or
 * only incomplete / dangling rules), so a caller can skip the pass entirely.
 *
 * Lowered against `useFilterClock`, armed only while a rule reads the clock, so
 * "Today" moves to the new day at local midnight without re-rendering filters
 * that never mention the time.
 */
export function useRowFilter<TRow>(
  group: FilterGroup | null,
  fields: FieldDef<TRow>[],
  resolveOperatorSet: (typeId: string) => FilterOperatorSet | undefined,
): ((row: TRow) => boolean) | null {
  // Whether the filter reads the clock does not depend on the clock's VALUE
  // (only on the operands), so it is asked before the clock hook that needs it;
  // the lowering is O(rules), never O(rows).
  const readsClock = useMemo(
    () => lowerFilterGroup(group, fields, resolveOperatorSet, 0).readsClock,
    [group, fields, resolveOperatorSet],
  );
  const now = useFilterClock(readsClock);
  return useMemo(() => {
    const { filter } = lowerFilterGroup(group, fields, resolveOperatorSet, now);
    return filter === undefined
      ? null
      : makeRowMatcher(filter, fields, resolveOperatorSet);
  }, [group, fields, resolveOperatorSet, now]);
}
