import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActiveData } from "@plugins/active-data/web";
import { InlineTextWalkerSlot } from "@plugins/primitives/plugins/inline-text/web";
import { TextEditorSlots } from "@plugins/primitives/plugins/text-editor/web";
import { GoBlock } from "./components/go-block";
import { GoInline } from "./components/go-inline";
import { GoInlineTextWalker } from "./internal/go-walker";
import { GoRegionPlugin } from "./internal/go-region-plugin";
import "./internal/register";

export default {
  description:
    "Renders <go>…</go> in an agent's reply — a part of the answer the user can pick as their reply — highlighted in place with the prompt templates' split chip: ➤ sends it back as <go>…</go> (the agent reads the part of its answer the user picked), ✎ Go puts it in the draft as an editable highlighted region with a GO tab. One line is inline wherever it is written; a multi-line block turns `- [ ]` lines into pickable rows and sends only the picked ones. The user's sent message shows the accepted <go> in full.",
  contributions: [
    ActiveData.Tag({
      display: "block",
      tag: "go",
      component: GoBlock,
      inline: GoInline,
    }),
    // Before active-data's chip walker (order 0): it must see the raw string.
    InlineTextWalkerSlot({
      id: "go",
      order: -1,
      Component: GoInlineTextWalker,
    }),
    TextEditorSlots.Plugin({ id: "go-region", component: GoRegionPlugin }),
  ],
} satisfies PluginDefinition;
