import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Website } from "@plugins/apps/plugins/website/plugins/shell/web";
import { FeaturesSection } from "./components/features-section";

export default {
  description:
    "Landing features band: a heading over a responsive grid of feature cards describing what equin ships (agent manager, pages, mail, theming, plugins, workflows).",
  contributions: [
    Website.Section({
      id: "features",
      label: "Features",
      component: FeaturesSection,
    }),
  ],
} satisfies PluginDefinition;
