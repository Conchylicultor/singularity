import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Website } from "@plugins/apps/plugins/website/plugins/shell/web";
import { PillarsSection } from "./components/pillars-section";

export default {
  description:
    "Landing three-pillars band: one teaser card per pillar (the apps, the agents, the platform), each opening its dedicated pillar page.",
  contributions: [
    Website.Section({
      id: "pillars",
      label: "Three pillars",
      component: PillarsSection,
    }),
  ],
} satisfies PluginDefinition;
