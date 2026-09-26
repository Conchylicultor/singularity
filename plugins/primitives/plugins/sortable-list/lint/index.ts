import noRawDndKit from "./no-raw-dnd-kit";
import noScalingTransform from "./no-scaling-transform";

export default {
  name: "sortable-list",
  rules: {
    "no-raw-dnd-kit": noRawDndKit,
    "no-scaling-transform": noScalingTransform,
  },
  /**
   * Globs where a rule is not enforced, keyed by rule id. `no-scaling-transform`
   * has none: no file may write the squashing transform, primitives included.
   */
  ignores: {
    "no-raw-dnd-kit": [
      "**/*.test.ts",
      "**/*.test.tsx",
      // This primitive is the sanctioned wrapper.
      "plugins/primitives/plugins/sortable-list/web/**",
      // The other drag primitives, which resolve drops to ranks themselves:
      // flat rank reorder (sortable, `CSS.Translate` only) and the tree (a
      // `DragOverlay` chip, so nothing scales).
      "plugins/primitives/plugins/rank-reorder/web/**",
      "plugins/primitives/plugins/tree/web/**",
      // The page editor's block drag: droppable gaps between blocks plus a
      // `DragOverlay` preview — not a sortable list.
      "plugins/page/plugins/editor/web/**",
      // Stub table naming every package the barrel importer fakes.
      "plugins/plugin-meta/plugins/barrel-import/core/internal/auto-stubs.generated.ts",
    ],
  },
};
