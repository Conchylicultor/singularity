import { Core, type PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { defineShortcut } from "@plugins/primitives/plugins/shortcuts/web";
import { getEditMode, setEditMode } from "@plugins/reorder/web";
import { PenButton } from "./internal/pen-button";
import { ScopeToggle } from "./internal/scope-toggle";
import { ExitPromptObserver } from "./internal/exit-prompt-observer";

export default {
  description:
    "Pen button on the top toolbar that toggles global edit mode for all reorderable slots; Esc exits edit mode.",
  contributions: [
    ActionBar.Item({
      id: "reorder-pen",
      excludeFromReorder: true,
      component: PenButton,
    }),
    ActionBar.Item({
      id: "reorder-scope-toggle",
      excludeFromReorder: true,
      component: ScopeToggle,
    }),
    // Stable top-level observer: arms the exit Cancel/Commit popover on the
    // edit-mode true→false transition (never remounts on edit-mode toggle,
    // unlike the pen button inside the action-bar slot).
    Core.Root({ component: ExitPromptObserver }),
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
