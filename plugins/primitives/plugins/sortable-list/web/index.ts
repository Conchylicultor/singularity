import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { SortableList } from "./internal/sortable-list";
export type { SortableListProps } from "./internal/sortable-list";
export { SortableItem } from "./internal/sortable-item";
export type {
  SortableItemProps,
  SortableItemState,
} from "./internal/sortable-item";

export default {
  name: "Sortable List",
  description:
    "Generic sortable list primitive with smooth displacement animations. Wraps @dnd-kit/sortable into SortableList + SortableItem components.",
  contributions: [],
} satisfies PluginDefinition;
