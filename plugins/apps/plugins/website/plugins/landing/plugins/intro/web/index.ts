import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Website } from "@plugins/apps/plugins/website/plugins/shell/web";
import { IntroSection } from "./components/intro-section";

export default {
  description:
    "Landing intro band: the two opening paragraphs of the equin site — what equin is, and why the page forks into two questions.",
  contributions: [
    Website.Section({ id: "intro", label: "Intro", component: IntroSection }),
  ],
} satisfies PluginDefinition;
