import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SonataProgress } from "@plugins/apps/plugins/sonata/plugins/progress/plugins/scrubber/web";
import { SectionBands } from "./components/section-bands";

export default {
  description:
    "Sonata progress marker: labeled section-region bands along the progression bar, drawn from 'section' annotations.",
  contributions: [
    SonataProgress.Marker({ id: "sections", component: SectionBands }),
  ],
} satisfies PluginDefinition;
