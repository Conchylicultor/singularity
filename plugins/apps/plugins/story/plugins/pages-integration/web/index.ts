import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import {
  PageDetail,
  PageTree,
} from "@plugins/apps/plugins/pages/plugins/page-tree/web";
import { UpgradeAction } from "./components/upgrade-action";
import { StorySection } from "./components/story-section";

export default {
  description:
    "Pages integration for Story: 'Upgrade to story' / 'Remove story' row action plus an embedded story section (renderer picker, live preview, Open in Story Builder).",
  contributions: [
    PageTree.RowActions({ id: "story", component: UpgradeAction }),
    PageDetail.Section({ id: "story", component: StorySection }),
  ],
} satisfies PluginDefinition;
