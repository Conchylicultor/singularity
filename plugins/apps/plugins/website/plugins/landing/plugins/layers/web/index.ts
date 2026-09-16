import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Website } from "@plugins/apps/plugins/website/plugins/shell/web";
import { LayersSection } from "./components/layers-section";

export default {
  description:
    "Landing layers band: 'What is equin?' as three stacked, clickable layers — the technical foundations, the applications built on them (by category, future ones dimmed), and the vision of one OS-like surface — each opening its own page.",
  contributions: [
    Website.Section({
      id: "layers",
      label: "Layers",
      component: LayersSection,
    }),
  ],
} satisfies PluginDefinition;
