import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { BLOCK_INSET, Editor } from "@plugins/page/plugins/editor/web";
import { promptBlock } from "../core";
import { PromptMarker } from "./components/prompt-marker";
import { PromptFooter } from "./components/prompt-footer";

export { promptBlock } from "../core";

export default {
  description:
    "Prompt block type: block text plus a launch control that turns it into an agent run, and chips for the conversations it launched.",
  contributions: [
    Editor.Block({
      id: promptBlock.type,
      match: promptBlock.type,
      block: promptBlock,
      // The prompt is ordinary page content — the same Lexical editor, marks,
      // inline tokens, CRDT text and undo as any other text block — so all this
      // type adds is presentation: a raised box, a leading glyph, and an action
      // row BESIDE the editable line, never around it.
      chrome: {
        padding: { x: BLOCK_INSET, y: "xs" },
        surface: "raised",
        // The box already supplies the left inset; don't stack the page rail
        // inset on top of it.
        inset: false,
        regions: { start: PromptMarker, footer: PromptFooter },
      },
    }),
  ],
} satisfies PluginDefinition;
