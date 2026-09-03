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
  // The `tag` is what the `"pinned"` dialect emits for an empty paragraph whose
  // position a blank line cannot state — the first or last of a sibling list, or
  // one carrying children (see `MarkdownContext.emptyBlocks`). `serialize` wins
  // everywhere else, so an ordinary empty paragraph is still a blank line, and
  // `<text/>` keeps parsing either way: documents written before the blank-line
  // dialect keep working.
  //
  // `attrs` emits NOTHING, deliberately. The derived projection JSON-encodes
  // every non-string field into one `data` attribute, so the default would spell
  // an empty paragraph `<text data="{&quot;text&quot;:[]}"/>` — an unreadable
  // way to say nothing. `parseAttrs` already ignores whatever it is handed, so
  // a bare `<text/>` parses back to exactly the same empty paragraph.
  markdown: {
    serialize: (data, ctx) =>
      runsLength(data.text) === 0 ? "" : ctx.md(data.text),
    tag: {
      name: "text",
      body: "none",
      attrs: () => ({}),
      parseAttrs: () => ({ text: [] }),
    },
  },
});
