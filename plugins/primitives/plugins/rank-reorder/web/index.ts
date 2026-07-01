import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { RankReorderProvider } from "./internal/rank-reorder-provider";
export type {
  RankReorderItem,
  RankReorderProviderProps,
} from "./internal/rank-reorder-provider";
export { RankReorderDndContext } from "./internal/rank-reorder-dnd-context";
export type { RankReorderDndContextProps } from "./internal/rank-reorder-dnd-context";
export { useRankReorderItem } from "./internal/use-rank-reorder-item";
export type { RankReorderItemControls } from "./internal/use-rank-reorder-item";

export default {
  description:
    "Flat rank-based drag-reorder primitive: a RankReorderProvider (lifted DnD shell + computeFlatReorder drop resolution, group-by aware) and useRankReorderItem (per-row draggable + before/after droppables). Shared by the tree's sibling zones and the data-view manual-order; depends only on rank + dnd-kit.",
  contributions: [],
} satisfies PluginDefinition;
