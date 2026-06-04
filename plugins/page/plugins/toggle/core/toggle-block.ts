import { MdChevronRight } from "react-icons/md";
import { z } from "zod";
import { defineBlock } from "@plugins/page/plugins/editor/core";

export const toggleDataSchema = z.object({ text: z.string() });

export const toggleBlock = defineBlock({
  type: "toggle",
  schema: toggleDataSchema,
  label: "Toggle",
  icon: MdChevronRight,
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
});
