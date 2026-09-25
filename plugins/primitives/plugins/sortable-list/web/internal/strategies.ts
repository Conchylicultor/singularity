// Re-export of the dnd-kit sorting strategies (and the array helper that pairs
// with a move) the primitive exposes, so consumers (reorder, collapsible-wrap,
// field lists) route through this barrel instead of importing @dnd-kit/sortable
// directly. The barrel's stated job is to wrap @dnd-kit/sortable, and the
// `sortable-list/no-raw-dnd-kit` lint rule keeps it the only way in.
export { arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
export type { SortingStrategy } from "@dnd-kit/sortable";
