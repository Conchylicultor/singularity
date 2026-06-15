import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Surface } from "@plugins/apps/plugins/surface/web";
import { floatingDef } from "./floating-placement";

export default {
  description:
    "Floating-window surface placement: a free-floating, draggable/resizable window over a desktop wallpaper backdrop. Owns the per-tab geometry store and window chrome.",
  contributions: [Surface.Placement(floatingDef)],
} satisfies PluginDefinition;
