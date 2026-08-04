import { MdFormatQuote } from "react-icons/md";
import { defineBlock, textDataSchema } from "@plugins/page/plugins/editor/core";

export const quoteBlock = defineBlock({
  type: "quote",
  schema: textDataSchema,
  label: "Quote",
  icon: MdFormatQuote,
  aliases: ["blockquote", "cite", "quotation"],
  empty: () => ({ text: [] }),
  placeholder: "Quote",
  // Typing `| ` at the start of a block converts it into a quote. TYPING-only,
  // and that is the whole reason the two prefix fields are separate: `| ` starts
  // a markdown TABLE ROW, so declaring it as `markdownPrefixes` would have
  // `derivedParsePrefixes` claim it and turn every row of a pasted table into a
  // quote block.
  typingPrefixes: ["| "],
  // NOTE: the canonical Markdown quote prefix `> ` is already claimed by the
  // `toggle` block, so this block still declares no `markdownPrefixes` — it has
  // a typing shortcut of its own, but no markdown line syntax.
  //
  // Which is exactly why it needs a TAG: with no markdown prefix it used to
  // serialize as a bare paragraph and come back as `text` — a silent type loss
  // on every round trip. `body: "text"` puts the quote's own text between the
  // tags (`<quote>wisdom</quote>`); its children still nest by indentation
  // below, like any other text block's.
  markdown: { tag: { body: "text" } },
  // Backspace at the very start resets to a plain paragraph (a second one then
  // merges); Enter on an empty quote breaks out to a paragraph.
  resetToOnBackspaceAtStart: "text",
  breakOutOnEmptyEnter: "text",
});
