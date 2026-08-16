import { MdTitle } from "react-icons/md";
import { defineBlock, textDataSchema } from "@plugins/page/plugins/editor/core";

export const heading2Block = defineBlock({
  type: "heading-2",
  schema: textDataSchema,
  label: "Heading 2",
  icon: MdTitle,
  aliases: ["h2", "subtitle"],
  empty: () => ({ text: [] }),
  placeholder: "Heading 2",
  // Typing `## ` at the start of a block converts it into an H2, preserving any
  // trailing text.
  markdownPrefixes: ["## "],
  textVariant: "heading",
  // See heading-1: the level tracks the markdown prefix (`## ` ⇔ 2).
  semantics: { role: "heading", level: 2 },
  // Enter at the end of a heading yields a body paragraph (Notion behavior).
  splitInto: "text",
});
