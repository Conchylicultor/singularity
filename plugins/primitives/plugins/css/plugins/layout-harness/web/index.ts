import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { layoutLabPane } from "./internal/lab-pane";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { layoutLabPane } from "./internal/lab-pane";

export default {
  description:
    "Live Layout Lab gallery: renders the layout-primitive fixture catalog across its width sweep, opened from the Debug sidebar.",
  contributions: [
    Pane.Register({ pane: layoutLabPane }),
    DebugApp.Sidebar({
      id: "layout-lab",
      title: "Layout Lab",
      icon: symbol("grid-view"),
      onClick: () => openPane(layoutLabPane, {}, { mode: "root" }),
    }),
  ],
  slots: { "layout-lab": layoutLabPane },
} satisfies PluginDefinition;
