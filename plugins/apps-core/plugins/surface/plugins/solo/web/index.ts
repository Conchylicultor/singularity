import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import {
  getSurfaceMode,
  exitToPreviousMode,
} from "@plugins/apps-core/plugins/tabs/web";
import { Surface } from "@plugins/apps-core/plugins/surface/web";
import { defineShortcut } from "@plugins/primitives/plugins/shortcuts/web";
import { soloDef } from "./solo-placement";

export default {
  description:
    "Solo (fullscreen) surface mode — only the focused tab, full-viewport, with a hover exit button and an Esc shortcut back to the previous mode.",
  contributions: [
    Surface.Placement(soloDef),
    // Esc exits solo (fullscreen) back to the mode it was entered from. The
    // `when` self-references this mode's own id (allowed — owned here).
    defineShortcut({
      id: "surface.exit-solo",
      keys: "Escape",
      label: "Exit fullscreen",
      group: "Surface",
      when: () => getSurfaceMode() === "solo",
      handler: () => exitToPreviousMode(),
    }),
  ],
} satisfies PluginDefinition;
