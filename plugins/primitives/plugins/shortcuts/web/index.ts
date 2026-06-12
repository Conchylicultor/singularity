import { Core, type PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ShortcutManager } from "./internal/shortcut-manager";

export { Shortcuts } from "./slots";
export { defineShortcut } from "./internal/define-shortcut";
export { formatShortcutLabel } from "./internal/format-keys";
export { isEditableTarget } from "./internal/editable-target";
export type { ShortcutDescriptor } from "./internal/types";

export default {
  description:
    "Central keyboard shortcut registry. Plugins contribute shortcuts via defineShortcut(); a single keydown listener dispatches to the active handler.",
  loadBearing: true,
  contributions: [Core.Root({ component: ShortcutManager })],
} satisfies PluginDefinition;
