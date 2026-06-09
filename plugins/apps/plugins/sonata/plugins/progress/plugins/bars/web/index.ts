import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SonataProgress } from "@plugins/apps/plugins/sonata/plugins/progress/plugins/scrubber/web";
import { BarTicks } from "./components/bar-ticks";

export default {
  description:
    "Sonata progress marker: bar/measure tick marks along the progression bar, derived from the score's time signatures via bars().",
  contributions: [
    SonataProgress.Marker({ id: "bars", component: BarTicks }),
  ],
} satisfies PluginDefinition;
