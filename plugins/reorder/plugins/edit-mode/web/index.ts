import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { defineShortcut } from "@plugins/primitives/plugins/shortcuts/web";
import {
  getEditMode,
  setEditMode,
} from "@plugins/primitives/plugins/edit-mode-signal/web";
import { EditLayoutSwitch } from "./internal/edit-layout-switch";

export default {
  description:
    "Edit-layout switch in the action bar's view-options popover that toggles global edit mode for all reorderable slots; Esc exits edit mode.",
  contributions: [
    ActionBar.ViewOption({
      id: "reorder-pen",
      // In edit mode every reorderable item is a drag target that ignores
      // clicks, so the switch that turns edit mode off must stay out of it.
      excludeFromReorder: true,
      component: EditLayoutSwitch,
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
