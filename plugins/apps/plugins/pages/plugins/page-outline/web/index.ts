import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { PageDetail } from "@plugins/apps/plugins/pages/plugins/page-tree/web";
import { PageOutline } from "./components/page-outline";

export default {
  description:
    "The open page's headings as an outline rail pinned to the right edge of the pane: one dash per heading, the current section highlighted, hover to expand into a click-to-jump outline. Headings are identified generically from each block type's declared `semantics`, so it names no block type.",
  contributions: [
    PageDetail.Overlay({ id: "outline", component: PageOutline }),
  ],
} satisfies PluginDefinition;
