import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { pageLinkBlock } from "../core";
import { PageLinkBlock } from "./components/page-link-block";

export { pageLinkBlock } from "../core";

export default {
  description:
    "Link-to-page block type: references another page as a clickable block; feeds the backlinks index.",
  contributions: [
    Editor.Block({ id: pageLinkBlock.type, match: pageLinkBlock.type, block: pageLinkBlock, component: PageLinkBlock }),
  ],
} satisfies PluginDefinition;
