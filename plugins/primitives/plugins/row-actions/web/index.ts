import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  RowActions,
  rowActionsAnchor,
  type RowActionsProps,
} from "./internal/row-actions";

export default {
  description:
    "Hover-revealed row-action cluster: a row of ordinary IconButtons revealed when their row is hovered/focused. The primitive owns the reveal (opacity↔pointer-events coupled, so a hidden action is never a live click-target), the right-edge Pin positioning, and the icon-xs sizing it applies to its children — so it ships no button of its own and stays BELOW icon-button, which is what lets css/row compose it. Reveal is driven by the primitive's own `group/row-actions` group, applied to the row via the exported `rowActionsAnchor` class — so it never piggybacks on a consumer's group name.",
  contributions: [],
} satisfies PluginDefinition;
