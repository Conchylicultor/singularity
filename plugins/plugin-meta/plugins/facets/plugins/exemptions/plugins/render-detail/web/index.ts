import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import {
  ExemptionsCount,
  ExemptionsDetailSection,
  useExemptionsAvailable,
} from "./components/exemptions-detail-section";

export default {
  description: "Per-plugin exemptions section in the plugin detail pane.",
  contributions: [
    PluginViewSlots.Section({
      id: "exemptions",
      label: "Exemptions",
      component: ExemptionsDetailSection,
      summary: ExemptionsCount,
      useAvailable: useExemptionsAvailable,
    }),
  ],
} satisfies PluginDefinition;
