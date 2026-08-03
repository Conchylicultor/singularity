import { MdNotes } from "react-icons/md";
import { defineBlock, runsLength, textDataSchema } from "@plugins/page/plugins/editor/core";

export const textBlock = defineBlock({
  type: "text",
  schema: textDataSchema,
  label: "Text",
  defaultText: true,
  icon: MdNotes,
  aliases: ["paragraph", "plain", "body", "p"],
  empty: () => ({ text: [] }),
  placeholder: "Type '/' for commands",
  // An EMPTY paragraph is a real block, and a blank line cannot represent it:
  // blank lines are skipped on parse, which is correct CommonMark and correct
  // for foreign markdown. The asymmetry is deliberate — what this codebase
  // EMITS round-trips, what a user PASTES stays lenient — so the empty case
  // gets a tag and everything else stays ordinary prose. `serialize` wins on
  // the way out; the `tag` below is what claims `<text/>` on the way back in.
  markdown: {
    serialize: (data, ctx) => (runsLength(data.text) === 0 ? "<text/>" : ctx.md(data.text)),
    tag: { name: "text", body: "none", parseAttrs: () => ({ text: [] }) },
  },
});
