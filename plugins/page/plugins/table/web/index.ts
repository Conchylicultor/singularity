import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { tableBlock } from "../core";
import { TableBlock } from "./components/table-block";
import { TableView } from "./components/table-view";

export default {
  description:
    "Table block type: a GFM pipe table rendered as a real table, with an in-place markdown source mode for editing it.",
  contributions: [
    Editor.Block({
      id: tableBlock.type,
      match: tableBlock.type,
      block: tableBlock,
      component: TableBlock,
      caret: "editor",
      view: TableView,
    }),
  ],
} satisfies PluginDefinition;
