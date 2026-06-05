import { useMemo } from "react";
import type { FieldDef, FieldValue, ViewState } from "../../core";

function isSearchable<TRow>(field: FieldDef<TRow>): boolean {
  if (field.filterable === true) return true;
  if (field.filterable === false) return false;
  const type = field.type ?? "text";
  return type === "text" || type === "enum";
}

/** Coerce a FieldValue to a comparable number/string for sorting. */
function comparableSort(value: FieldValue): number | string {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "boolean") return Number(value);
  if (typeof value === "number") return value;
  return String(value ?? "");
}

export function useDataViewRows<TRow>(
  rows: readonly TRow[],
  fields: FieldDef<TRow>[],
  state: ViewState,
  searchAccessor?: (row: TRow) => string,
): readonly TRow[] {
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
            .filter((f) => isSearchable(f) && f.value)
            .map((f) => String(f.value!(row) ?? ""))
            .join(" "));
      result = result.filter((row) => accessor(row).toLowerCase().includes(lc));
    }

    // --- Filter (Phase 3 — intentional no-op hook point) ---
    // Per-field filters (state.filters) are carried but not yet applied.
    // Phase 3 will apply them here, before sort.

    // --- Sort ---
    if (state.sort) {
      const field = fields.find((f) => f.id === state.sort!.fieldId);
      if (field?.value) {
        const valueFn = field.value;
        const direction = state.sort.direction;
        result.sort((a, b) => {
          const va = comparableSort(valueFn(a));
          const vb = comparableSort(valueFn(b));
          const cmp =
            typeof va === "number" && typeof vb === "number"
              ? va - vb
              : String(va).localeCompare(String(vb));
          return direction === "desc" ? -cmp : cmp;
        });
      }
    }

    return result;
  }, [rows, fields, state, searchAccessor]);
}
