import { z } from "zod";
import { MdFunctions } from "react-icons/md";
import { defineBlock } from "@plugins/page/plugins/editor/core";

export const EQUATION_TYPE = "equation";

export const equationBlock = defineBlock({
  type: EQUATION_TYPE,
  schema: z.object({ expression: z.string().default("") }),
  label: "Equation",
  icon: MdFunctions,
  aliases: ["math", "latex", "katex", "formula", "tex", "equation"],
  empty: () => ({ expression: "" }),
  // Typing `$$` at the start of a text block converts it into an equation block.
  // The generic MarkdownShortcutPlugin reads this off the slot — no editor changes.
  markdownPrefixes: ["$$"],
});
