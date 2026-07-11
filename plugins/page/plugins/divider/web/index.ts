import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { dividerBlock } from "../core";
import { DividerBlock } from "./components/divider-block";

export { dividerBlock, DIVIDER_TYPE } from "../core";

export default {
  description:
    "Divider block type: a thin horizontal rule marking a section break; insert via `/divider` or the `---` markdown shortcut.",
  contributions: [
    Editor.Block({ id: dividerBlock.type, match: dividerBlock.type, block: dividerBlock, component: DividerBlock }),
  ],
} satisfies PluginDefinition;
