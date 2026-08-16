import { MdTitle } from "react-icons/md";
import { defineBlock, textDataSchema } from "@plugins/page/plugins/editor/core";

export const heading1Block = defineBlock({
  type: "heading-1",
  schema: textDataSchema,
  label: "Heading 1",
  icon: MdTitle,
  aliases: ["h1", "title", "heading"],
  empty: () => ({ text: [] }),
  placeholder: "Heading 1",
  // Typing `# ` at the start of a block converts it into an H1, preserving any
  // trailing text.
  markdownPrefixes: ["# "],
  textVariant: "title",
  // A heading in the accessibility tree, so heading-jump reaches it. The level
  // tracks the markdown prefix above (`# ` ⇔ 1), never `textVariant` — that one
  // is a font size, and a big paragraph is not a heading.
  semantics: { role: "heading", level: 1 },
  // Enter at the end of a heading yields a body paragraph (Notion behavior).
  splitInto: "text",
});
