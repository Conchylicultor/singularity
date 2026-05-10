import type { PluginDefinition } from "@core";
import { ActiveData } from "@plugins/active-data/web";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { PluginLinkChip } from "./components/plugin-link-chip";
import { PLUGIN_NAME_RE } from "./internal/pattern";
import { pluginConvSidePane } from "./panes";

export { PluginLinkChip };

export default {
  id: "active-data-plugin-link",
  name: "Active Data: plugin link chip",
  description:
    "Renders plugin hierarchy IDs in backtick-wrapped inline code as clickable chips that open the plugin-view pane. Models emit the plugin's hierarchyId (e.g. `tasks`, `active-data.conv`) and the chip validates and resolves it at render time.",
  contributions: [
    ActiveData.Tag({ display: "code", pattern: PLUGIN_NAME_RE, component: PluginLinkChip }),
    Pane.Register({ pane: pluginConvSidePane }),
  ],
} satisfies PluginDefinition;
