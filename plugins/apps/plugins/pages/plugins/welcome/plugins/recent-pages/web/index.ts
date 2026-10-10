import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PagesWelcome } from "@plugins/apps/plugins/pages/plugins/welcome/web";
import { RecentPagesSection } from "./components/recent-pages-section";

export default {
  description:
    "Recent-pages section for the Pages landing surface: the most recently edited pages (by each page row's `editedAt`: its row and its content together) as clickable rows.",
  contributions: [
    PagesWelcome.Section({ id: "recent-pages", component: RecentPagesSection }),
  ],
} satisfies PluginDefinition;
