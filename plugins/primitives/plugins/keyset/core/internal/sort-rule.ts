/** Sort direction for one keyset ordering key. */
export type SortDirection = "asc" | "desc";

/**
 * One level of a keyset ordering: a field id + its direction. Priority = position
 * in the `KeysetSortRule[]`. Structurally identical to data-view's `SortRule`, but
 * defined here so the keyset primitive stays a leaf (no data-view dependency) — a
 * data-view `SortRule[]` is assignable to a `KeysetSortRule[]` by construction.
 */
export interface KeysetSortRule {
  fieldId: string;
  direction: SortDirection;
}
