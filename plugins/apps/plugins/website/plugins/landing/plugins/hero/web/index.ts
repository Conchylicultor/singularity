import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Website } from "@plugins/apps/plugins/website/plugins/shell/web";
import { HeroSection } from "./components/hero-section";

export default {
  description:
    "Landing hero band: the eyebrow + headline + subheadline opening statement for the equin public site.",
  contributions: [
    Website.Section({ id: "hero", label: "Hero", component: HeroSection }),
  ],
} satisfies PluginDefinition;
