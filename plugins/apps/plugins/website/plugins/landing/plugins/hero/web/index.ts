import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Website } from "@plugins/apps/plugins/website/plugins/shell/web";
import { HeroSection } from "./components/hero-section";

export default {
  description:
    "Landing hero band: the site's one headline — what equin is — over an ambient accent wash, and the paragraph that sets up the two questions below it.",
  contributions: [
    Website.Section({ id: "hero", label: "Hero", component: HeroSection }),
  ],
} satisfies PluginDefinition;
