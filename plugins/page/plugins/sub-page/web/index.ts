import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { subPageBlock } from "../core";
import { SubPageBlock } from "./components/sub-page-block";

export { subPageBlock } from "../core";

export default {
  description:
    "Sub-page block type: renders a child page inline in its parent's content flow as a clickable Notion-style page row. A void, text-less block — selectable and arrow-navigable, but Enter/Backspace can never originate in it.",
  contributions: [
    Editor.Block({ match: subPageBlock.type, block: subPageBlock, component: SubPageBlock }),
  ],
} satisfies PluginDefinition;
