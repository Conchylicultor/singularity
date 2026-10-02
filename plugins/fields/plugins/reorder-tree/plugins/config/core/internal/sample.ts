import { fieldSample } from "@plugins/config_v2/plugins/fields/core";
import { reorderTreeField } from "./reorder-tree";

/**
 * The reorder-tree field's fixed gallery sample (see `FieldSample`): plain
 * item nodes only, so no contributed node type (spacer, header) is needed to
 * render it.
 */
export const reorderTreeSample = fieldSample(
  reorderTreeField({
    label: "Toolbar order",
    description: "Order of the buttons in the toolbar.",
  }),
  ["search", "new-task", "filter", "share"],
);
