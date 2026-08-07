import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActiveData, codeTag } from "@plugins/active-data/web";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { PluginLinkChip } from "./components/plugin-link-chip";
import { usePluginClaim } from "./internal/use-plugin-claim";
import { PLUGIN_NAME_RE } from "./internal/pattern";
import { pluginConvSidePane } from "./panes";

export default {
  description:
    "Renders plugin IDs in backtick-wrapped inline code as clickable chips that open the plugin-view pane. Models emit the plugin's dotted id (e.g. `tasks`, `active-data.conv`) and the chip validates and resolves it at render time.",
  contributions: [
    ActiveData.Tag(
      codeTag({
        id: "plugin-link",
        pattern: PLUGIN_NAME_RE,
        useClaim: usePluginClaim,
        component: PluginLinkChip,
      }),
    ),
    Pane.Register({ pane: pluginConvSidePane }),
  ],
} satisfies PluginDefinition;
