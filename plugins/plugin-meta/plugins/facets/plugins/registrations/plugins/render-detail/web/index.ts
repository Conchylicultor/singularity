import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PluginViewSlots } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { RegistrationsDetailSection } from "./components/registrations-detail-section";

export default {
  name: "Registrations: Detail Section",
  description: "Per-plugin registrations section in the plugin detail pane.",
  contributions: [
    PluginViewSlots.Section({
      id: "registrations",
      label: "Registrations",
      component: RegistrationsDetailSection,
    }),
  ],
} satisfies PluginDefinition;
