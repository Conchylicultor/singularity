import { useMemo } from "react";
import type { FieldDef, FilterOperatorSet, ViewState } from "../../core";
import { useRowFilter } from "./use-row-filter";
import { makeSortComparator } from "./sort-rows";

function isSearchable<TRow>(field: FieldDef<TRow>): boolean {
  if (field.filterable === true) return true;
  if (field.filterable === false) return false;
  const type = field.type ?? "text";
  return type === "text" || type === "enum" || type === "tags";
}

export function useFlatRows<TRow>(
  rows: readonly TRow[],
  fields: FieldDef<TRow>[],
  state: ViewState,
  resolveOperatorSet: (typeId: string) => FilterOperatorSet | undefined,
  searchAccessor?: (row: TRow) => string,
): readonly TRow[] {
  // The filter tree lowered into the filter language once per (tree, clock),
  // never per row; null ⇒ nothing constrains.
  const matchesFilter = useRowFilter(state.filter, fields, resolveOperatorSet);
  return useMemo(() => {
    let result = [...rows];

    // --- Search (substring, case-insensitive) ---
    const query = state.query.trim();
    if (query) {
      const lc = query.toLowerCase();
      const accessor =
        searchAccessor ??
        ((row: TRow) =>
          fields
            .filter((f) => isSearchable(f))
            .map((f) =>
              f.values ? f.values(row).join(" ") : String(f.value?.(row) ?? ""),
            )
            .join(" "));
      result = result.filter((row) => accessor(row).toLowerCase().includes(lc));
    }

    // --- Filter (the tree lowered through the data-view.filter operator sets) ---
    if (matchesFilter) result = result.filter(matchesFilter);

    // --- Sort (multi-level, stable; null when no rule resolves) ---
    const comparator = makeSortComparator(state.sort, fields);
    if (comparator) result.sort(comparator);

    return result;
  }, [rows, fields, state, matchesFilter, searchAccessor]);
}
