import { MdAutoAwesome } from "react-icons/md";
import { defineBlock, textBlockSchema } from "@plugins/page/plugins/editor/core";

// The block IS the prompt: its payload is plain text-bearing block data, with no
// extra fields. In particular it stores NO task ids — the tasks a block launched
// are derived from the `tasks_ext_prompt_block` link rows (see the `link`
// sub-plugin), so a deleted task drops out on its own and the two can't drift.
export const promptDataSchema = textBlockSchema({});

export const promptBlock = defineBlock({
  type: "prompt",
  schema: promptDataSchema,
  label: "Prompt",
  icon: MdAutoAwesome,
  aliases: ["agent", "ask", "launch", "claude", "ai"],
  empty: () => ({ text: [] }),
  placeholder: "Ask an agent…",
  // v1's prompt is this block's own text only, so Enter at the end starts an
  // ordinary paragraph rather than a second prompt; Backspace at the very start
  // resets to a paragraph and Enter on an empty prompt breaks out of it. Same
  // knob set as the toggle block — the editor core never names a type, the
  // target is supplied here.
  splitInto: "text",
  resetToOnBackspaceAtStart: "text",
  breakOutOnEmptyEnter: "text",
  // The padded box adds an `Inset y="xs"` on top of the text editor's own
  // `py-xs`, so the first line sits one extra `--space-xs` lower than a plain
  // text block — the callout's geometry exactly.
  gutterFirstLineCenter: "calc(var(--space-xs) * 2 + var(--doc-lh-body) / 2)",
});
