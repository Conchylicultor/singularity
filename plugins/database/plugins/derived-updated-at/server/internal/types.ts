// A column's rule for whether a write to it counts as a change of the record,
// moving its `updatedAt`:
//   - `true`  → any change of value (`NEW.c IS DISTINCT FROM OLD.c`);
//   - `false` → never;
//   - `{ into, outOf }` → only a change INTO one of `into` or OUT OF one of
//     `outOf`. Typed against the column's own value type by the declaring
//     side (entities' `TouchedBy`), so a misspelled value is a tsc error.
export type TouchRule<T> =
  boolean | { readonly into?: readonly T[]; readonly outOf?: readonly T[] };

// The compiled trigger for one table: plain DDL strings plus the sha256 of
// both, stored as the trigger's COMMENT so an up-to-date install is recognised
// from the catalog alone. Built by `compileDerivedUpdatedAt`.
export interface DerivedUpdatedAtSpec {
  /** Physical table name. */
  readonly table: string;
  /** Name of both the trigger and its function (`<table>_derive_updated_at`). */
  readonly triggerName: string;
  readonly functionDdl: string;
  readonly triggerDdl: string;
  readonly signature: string;
}
