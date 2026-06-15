import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PagesWelcome } from "@plugins/apps/plugins/pages/plugins/welcome/web";
import { RecentPagesSection } from "./components/recent-pages-section";

export default {
  description:
    "Recent-pages section for the Pages landing surface: the most recently updated pages as clickable rows.",
  contributions: [
    PagesWelcome.Section({ id: "recent-pages", component: RecentPagesSection }),
  ],
} satisfies PluginDefinition;
