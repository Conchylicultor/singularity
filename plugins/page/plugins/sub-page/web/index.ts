import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { subPageBlock } from "../core";
import { SubPageBlock } from "./components/sub-page-block";
import { SubPageFrame } from "./components/sub-page-frame";
import { isPageCard } from "./internal/page-card";

export { subPageBlock } from "../core";

export default {
  description:
    "Sub-page block type: renders a child page inline in its parent's content flow as a clickable Notion-style page row. A void, text-less block — selectable and arrow-navigable, but Enter/Backspace can never originate in it. A page of a special kind (agent-authored, instructions) expanded inline is drawn as a card: its reference's tint washes the row and all of its content.",
  contributions: [
    Editor.Block({
      id: subPageBlock.type,
      match: subPageBlock.type,
      block: subPageBlock,
      component: SubPageBlock,
      caret: "renderer",
    }),
    // An expanded agent-authored or instructions page is a CARD: one wash over
    // its row and its content. Only those blocks — every other page row stays
    // unframed, so an ordinary sub-page expands exactly as it always did.
    Editor.BlockFrame({
      match: subPageBlock.type,
      applies: isPageCard,
      component: SubPageFrame,
      // A wash is a filled box: its content clears every edge.
      pad: "box",
    }),
  ],
} satisfies PluginDefinition;
