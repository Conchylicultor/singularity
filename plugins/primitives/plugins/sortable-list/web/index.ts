import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { SortableList } from "./internal/sortable-list";
export type { SortableListProps } from "./internal/sortable-list";
export { SortableItem } from "./internal/sortable-item";
export type {
  SortableItemProps,
  SortableItemState,
} from "./internal/sortable-item";
export { rectSortingStrategy } from "./internal/strategies";
export type { SortingStrategy } from "./internal/strategies";

export default {
  description:
    "Generic sortable list primitive with smooth displacement animations. Wraps @dnd-kit/sortable into SortableList + SortableItem components.",
  contributions: [],
} satisfies PluginDefinition;
