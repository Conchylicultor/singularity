import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";

/**
 * Right inset that clears the collapsed floating bar (a `size-8` icon anchored
 * at `right-3`). Published by the bar as the `--floating-bar-safe-area` CSS var
 * so app headers can reserve a gutter via the `pr-floating-bar` utility instead
 * of hand-rolling a `pr-14`.
 */
export const FLOATING_BAR_GUTTER = "3.5rem";

export const floatingBarConfig = defineConfig({
  fields: {
    enabled: boolField({
      default: true,
      label: "Floating action bar",
      description:
        "Show a floating action bar in the top-right of every app except the Agent Manager (which already has the toolbar), surfacing the main actions (Improve, Build, Screenshot, …). Collapses to a status icon; expands on hover.",
    }),
  },
});
