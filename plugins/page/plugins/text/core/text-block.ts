import { MdNotes } from "react-icons/md";
import {
  defineBlock,
  runsLength,
  textDataSchema,
} from "@plugins/page/plugins/editor/core";

export const textBlock = defineBlock({
  type: "text",
  schema: textDataSchema,
  label: "Text",
  defaultText: true,
  icon: MdNotes,
  aliases: ["paragraph", "plain", "body", "p"],
  empty: () => ({ text: [] }),
  placeholder: "Type '/' for commands",
  // An EMPTY paragraph is a BLANK LINE — the same thing a reader of this
  // projection, or a user pressing Enter twice, already means by one. Which way
  // a blank line reads on the way back IN is not this type's business but the
  // caller's `MarkdownContext.blankLines` dialect: our own documents say "empty
  // paragraph", a pasted README says "paragraph separator".
  //
  // The `tag` stays, deliberately, and is insurance rather than leftovers:
  // `<text/>` still parses, so documents written before the blank-line dialect
  // keep working, and an empty block whose position a blank line cannot express
  // can still be written explicitly. `serialize` wins on the way out, so nothing
  // emits it. See `research/2026-09-01-page-blank-line-empty-paragraph.md`.
  markdown: {
    serialize: (data, ctx) =>
      runsLength(data.text) === 0 ? "" : ctx.md(data.text),
    tag: { name: "text", body: "none", parseAttrs: () => ({ text: [] }) },
  },
});
