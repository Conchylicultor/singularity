import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TabBarSlots } from "@plugins/ui/plugins/tab-bar/web";
import { ConnectedTab } from "./components/connected-tab";

export default {
  description: "Folder tab; the active tab merges into the content surface.",
  contributions: [
    TabBarSlots.Variant({
      id: "connected",
      label: "Connected",
      match: "connected",
      component: ConnectedTab,
      // Full-height folder tabs fused to the content seam — see fillHeight.
      fillHeight: true,
    }),
  ],
} satisfies PluginDefinition;
