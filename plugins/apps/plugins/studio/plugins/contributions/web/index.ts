import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { Studio } from "@plugins/apps/plugins/studio/plugins/shell/web";
import { contributionsPane } from "./panes";
import { symbol } from "@plugins/ui/plugins/icons/core";

export default {
  description: "Central view of all plugin contributions aggregated by type.",
  contributions: [
    Pane.Register({ pane: contributionsPane }),
    Studio.Sidebar({
      id: "contributions",
      title: "Contributions",
      icon: symbol("library-books"),
      opens: { pane: contributionsPane, params: {} },
    }),
  ],
  slots: { contributions: contributionsPane },
} satisfies PluginDefinition;
