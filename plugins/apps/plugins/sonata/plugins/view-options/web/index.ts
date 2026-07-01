import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Sonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { ViewOptionsToggle } from "./components/view-options-toggle";

export default {
  description:
    "Sonata Hud: shared display-options chip. Renders every Sonata.ViewOption contribution generically via FieldRenderer, so the View popover appears in every display lens (piano roll, notation, songsheet).",
  contributions: [Sonata.Hud({ id: "view-options", component: ViewOptionsToggle })],
} satisfies PluginDefinition;
