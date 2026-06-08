// Re-export of the dnd-kit sorting strategies the primitive exposes, so
// consumers (reorder, collapsible-wrap) route through this barrel instead of
// importing @dnd-kit/sortable directly. The barrel's stated job is to wrap
// @dnd-kit/sortable.
export { rectSortingStrategy } from "@dnd-kit/sortable";
export type { SortingStrategy } from "@dnd-kit/sortable";
