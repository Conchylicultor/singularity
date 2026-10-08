import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import {
  HealthCount,
  HealthSection,
  useHealthAvailable,
} from "./components/health-section";
import { IdKinds } from "@plugins/ids/web";
import { pluginReviewIdKind } from "../core";

export default {
  description:
    "Displays health review status and staleness in the plugin detail pane.",
  contributions: [
    IdKinds.Kind({ kind: pluginReviewIdKind }),
    PluginViewSlots.Section({
      id: "health",
      label: "Health",
      component: HealthSection,
      summary: HealthCount,
      useAvailable: useHealthAvailable,
    }),
  ],
} satisfies PluginDefinition;
