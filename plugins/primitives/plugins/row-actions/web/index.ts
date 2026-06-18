import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  RowActions,
  RowActionButton,
  rowActionsAnchor,
  type RowActionsProps,
  type RowActionButtonProps,
} from "./internal/row-actions";

export default {
  description:
    "Hover-revealed row-action cluster: a row of small ghost icon buttons (RowActionButton) revealed when their row is hovered/focused. The primitive owns the reveal (opacity↔pointer-events coupled, so a hidden action is never a live click-target), the right-edge Pin positioning, and the standard icon-xs sizing. Reveal is driven by the primitive's own `group/row-actions` group, applied to the row via the exported `rowActionsAnchor` class — so it never piggybacks on a consumer's group name.",
  contributions: [],
} satisfies PluginDefinition;
