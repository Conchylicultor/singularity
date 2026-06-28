import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import {
  getFocusedPlacement,
  setFocusedTabPlacement,
  getDefaultPlacement,
} from "@plugins/apps-core/web";
import { Surface } from "@plugins/apps-core/plugins/surface/web";
import { defineShortcut } from "@plugins/primitives/plugins/shortcuts/web";
import { soloDef } from "./solo-placement";

export default {
  description:
    "Solo (fullscreen) surface placement — a single tab full-app over everything, with a hover exit button and an Esc shortcut back to the default placement.",
  contributions: [
    Surface.Placement(soloDef),
    // Esc exits a solo (fullscreen) tab back to the default placement. The
    // `when` self-references this placement's own id (allowed — owned here).
    defineShortcut({
      id: "surface.exit-solo",
      keys: "Escape",
      label: "Exit fullscreen",
      group: "Surface",
      when: () => getFocusedPlacement() === "solo",
      handler: () => setFocusedTabPlacement(getDefaultPlacement()),
    }),
  ],
} satisfies PluginDefinition;
