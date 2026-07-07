import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { WebsitePlatform } from "@plugins/apps/plugins/website/plugins/pillars/plugins/platform/web";
import { PluginPyramidSection } from "./components/plugin-pyramid";

export default {
  description:
    "Interactive pyramid composer on the public site's Platform page: the visitor toggles plugin blocks on/off and watches a sample app's regions appear or empty into labelled slots, with the top tier showing the release targets the one composition ships to — the plugins → apps → releases architecture made visible.",
  contributions: [
    WebsitePlatform.Section({
      id: "plugin-pyramid",
      label: "Pyramid demo",
      component: PluginPyramidSection,
    }),
  ],
} satisfies PluginDefinition;
