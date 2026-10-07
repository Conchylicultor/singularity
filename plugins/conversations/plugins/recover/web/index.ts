import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { recoveryPane } from "./pane";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { recoveryPane } from "./pane";

export default {
  description:
    "Sidebar entry + pane listing recently-closed conversations with restore buttons.",
  contributions: [
    Pane.Register({ pane: recoveryPane }),
    DebugApp.Sidebar({
      id: "conversations-recover",
      title: "Recovery",
      icon: symbol("history"),
      opens: { pane: recoveryPane, params: {} },
    }),
  ],
  slots: { "conversations-recover": recoveryPane },
} satisfies PluginDefinition;
