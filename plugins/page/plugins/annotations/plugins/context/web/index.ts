import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { ContainerNoRow } from "@plugins/page/plugins/container/web";
import { contextBlock } from "../core";
import { ContextAnchor } from "./components/context-anchor";
import { ContextFrame } from "./components/context-frame";

export { contextBlock } from "../core";

export default {
  description:
    "Context block type: a void CONTAINER whose soft-tinted box wraps blocks of any type nested inside it, holding standing instructions addressed to agents rather than to the reader.",
  contributions: [
    // The card renders NO row of its own — `BlockRow`'s anchored branch never
    // dispatches `Editor.Block` for an `anchor` type, so the container
    // primitive's shared null renderer is unreachable. The registration itself is
    // where the HANDLE lives, and the handle is what the insert palette, the
    // markdown pipeline, paste, the turn-into list and `useAnchorTypes()` (the
    // reducer's `anchorTypes`) all read.
    Editor.Block({
      id: contextBlock.type,
      match: contextBlock.type,
      block: contextBlock,
      component: ContainerNoRow,
    }),
    // Contributing a frame is what MAKES this a container: the framed-type set is
    // derived from this slot's registered matches (`useFramedBlockTypes()`), so
    // there is no second "I am a container" flag to drift from who actually
    // paints a box. the DECORATION rides on the SAME registration, so the handle's
    // `anchor: true` cannot claim one that nothing supplies. This family asks for
    // the CORNER seat — the card's own name, revealed only while the pointer is
    // inside its box — where the callout asks for the gutter glyph.
    // (`./singularity check page-editor:anchor-has-decoration`).
    Editor.BlockFrame({
      match: contextBlock.type,
      component: ContextFrame,
      cornerAnchor: ContextAnchor,
      // A wash is a filled box: its content clears every edge.
      pad: "box",
    }),
  ],
} satisfies PluginDefinition;
