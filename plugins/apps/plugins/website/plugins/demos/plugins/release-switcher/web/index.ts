import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Website } from "@plugins/apps/plugins/website/plugins/shell/web";
import { ReleaseSwitcherSection } from "./components/release-switcher";

export default {
  description:
    "Release-targets switcher demo band for the equin landing page: the same sample app re-hosted live in a native desktop window, a browser tab, and a window inside the equin workspace — proving one composition ships three ways.",
  contributions: [
    Website.Section({
      id: "release-switcher",
      label: "Release targets",
      component: ReleaseSwitcherSection,
    }),
  ],
} satisfies PluginDefinition;
