import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PagesWelcome } from "@plugins/apps/plugins/pages/plugins/welcome/web";
import { QuickCreateSection } from "./components/quick-create-section";

export default {
  description:
    "Quick-create section for the Pages landing surface: template tiles (blank, to-do, bulleted list) that create and open a new page.",
  contributions: [
    PagesWelcome.Section({ id: "quick-create", component: QuickCreateSection }),
  ],
} satisfies PluginDefinition;
