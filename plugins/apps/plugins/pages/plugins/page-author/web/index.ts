import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PageDetail } from "@plugins/apps/plugins/pages/plugins/page-tree/web";
import { PageAuthorToggle } from "./components/page-author-toggle";

export default {
  description:
    "Agent-page toggle in the page-detail header: pressed and blue on an agent-authored page, it flips the open page between agent-authored (agents may write all of it) and an ordinary page.",
  contributions: [
    PageDetail.HeaderActions({
      id: "page-author",
      component: PageAuthorToggle,
    }),
  ],
} satisfies PluginDefinition;
