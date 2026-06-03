import { type PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { defineShortcut } from "@plugins/primitives/plugins/shortcuts/web";
import { getEditMode, setEditMode } from "@plugins/reorder/web";
import { PenButton } from "./internal/pen-button";

export default {
  name: "Reorder: Edit Mode",
  description:
    "Pen button on the top toolbar that toggles global edit mode for all reorderable slots; Esc exits edit mode.",
  contributions: [
    ActionBar.Item({
      id: "reorder-pen",
      excludeFromReorder: true,
      component: PenButton,
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
