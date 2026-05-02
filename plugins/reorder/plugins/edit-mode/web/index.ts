import { Core, type PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web";
import { PenButton } from "./internal/pen-button";
import { EscHandler } from "./internal/esc-handler";

export default {
  id: "reorder-edit-mode",
  name: "Reorder: Edit Mode",
  description:
    "Pen button on the top toolbar that toggles global edit mode for all reorderable slots; Esc exits edit mode.",
  contributions: [
    Shell.Toolbar({
      id: "reorder-pen",
      excludeFromReorder: true,
      component: PenButton,
      group: "actions",
    }),
    Core.Root({ component: EscHandler }),
  ],
} satisfies PluginDefinition;
