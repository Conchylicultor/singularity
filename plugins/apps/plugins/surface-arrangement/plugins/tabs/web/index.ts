import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { AppTabsBody } from "@plugins/apps/web";
import { SurfaceArrangement } from "@plugins/apps/plugins/surface-arrangement/web";

export default {
  description:
    "Tabs surface arrangement — one fullscreen tab at a time (the default keep-alive surface).",
  contributions: [
    SurfaceArrangement.Variant({
      id: "tabs",
      label: "Tabs",
      match: "tabs",
      component: AppTabsBody,
    }),
  ],
} satisfies PluginDefinition;
