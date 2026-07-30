import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { quoteBlock } from "../core";

export { quoteBlock } from "../core";

export default {
  description: "Quote / blockquote block type for the page editor.",
  contributions: [
    Editor.Block({
      id: quoteBlock.type,
      match: quoteBlock.type,
      block: quoteBlock,
      // A blockquote is an ordinary text block wearing a left border and italic
      // emphasis — pure paint on the shared skeleton's box, no component of its
      // own. No `padding` and no `inset: false`: the line supplies the page
      // rail's left inset exactly as every other text block does, so quote text
      // stays aligned instead of being double-indented.
      chrome: { boxClassName: "border-l-2 border-muted-foreground/30 italic" },
    }),
  ],
} satisfies PluginDefinition;
