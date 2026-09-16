import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Website } from "@plugins/apps/plugins/website/plugins/shell/web";
import { ScreenshotSection } from "./components/screenshot-section";

export default {
  description:
    "Landing screenshot band: a drawn picture of equin in desktop mode — the agent manager, a Pages document and Sonata breaking a song down into chords as three windows side by side on one surface — with its caption.",
  contributions: [
    Website.Section({
      id: "screenshot",
      label: "Screenshot",
      component: ScreenshotSection,
    }),
  ],
} satisfies PluginDefinition;
