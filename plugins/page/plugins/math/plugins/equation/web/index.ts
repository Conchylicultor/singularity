import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { equationBlock } from "../core";
import { EquationBlock } from "./components/equation-block";

export { EQUATION_TYPE, equationBlock } from "../core";

export default {
  description:
    "Block-level equation block type: a focusable LaTeX source editor with a live centered KaTeX render.",
  contributions: [
    Editor.Block({ match: equationBlock.type, block: equationBlock, component: EquationBlock }),
  ],
} satisfies PluginDefinition;
