import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Surface } from "@plugins/apps/plugins/surface/web";
import { dockedDef } from "./docked-placement";

export default {
  description:
    "Docked surface placement — the default full-area tab that fills the surface below the tab strip.",
  contributions: [Surface.Placement(dockedDef)],
} satisfies PluginDefinition;
