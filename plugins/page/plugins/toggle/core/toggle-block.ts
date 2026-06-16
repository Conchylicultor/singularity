import { MdChevronRight } from "react-icons/md";
import { defineBlock, textBlockSchema } from "@plugins/page/plugins/editor/core";

export const toggleDataSchema = textBlockSchema({});

export const toggleBlock = defineBlock({
  type: "toggle",
  schema: toggleDataSchema,
  label: "Toggle",
  icon: MdChevronRight,
  aliases: ["collapsible", "accordion", "details", "expand"],
  empty: () => ({ text: "" }),
  placeholder: "Toggle",
  // Typing `> ` at the start of a block converts it into a toggle, preserving
  // any trailing text.
  markdownPrefixes: ["> "],
  // Always show the collapse chevron, even before the toggle has children.
  collapsible: "always",
  // When expanded, Enter nests the split-off content as a `text` first child;
  // collapsed, it splits into a sibling. Driven generically by the editor.
  splitChildWhenExpanded: { childType: "text" },
  // Backspace at the very start resets to a plain paragraph (a second one then
  // merges); Enter on an empty toggle breaks out to a paragraph.
  resetToOnBackspaceAtStart: "text",
  breakOutOnEmptyEnter: "text",
});
