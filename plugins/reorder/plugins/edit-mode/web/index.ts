import { type PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Shell } from "@plugins/shell/web";
import { defineShortcut } from "@plugins/primitives/plugins/shortcuts/web";
import { getEditMode, setEditMode } from "@plugins/reorder/web";
import { PenButton } from "./internal/pen-button";

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
    defineShortcut({
      id: "reorder.exit-edit-mode",
      keys: "escape",
      label: "Exit edit mode",
      group: "Reorder",
      handler: () => setEditMode(false),
      when: () => getEditMode(),
    }),
  ],
} satisfies PluginDefinition;
