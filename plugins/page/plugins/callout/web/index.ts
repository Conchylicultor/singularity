import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { calloutBlock } from "../core";
import { CalloutAnchor, CalloutNoRow } from "./components/callout-anchor";
import { CalloutFrame } from "./components/callout-frame";

export { calloutBlock } from "../core";

export default {
  description:
    "Callout block type: a void CONTAINER whose tinted box wraps blocks of any type nested inside it, with a changeable leading icon and semantic color, for notes/tips/warnings.",
  contributions: [
    // The callout renders NO row of its own — `BlockRow`'s anchored branch never
    // dispatches `Editor.Block` for an `anchor` type, so this renderer is
    // unreachable and returns null. The registration itself is NOT vestigial: it
    // is where the handle lives, and the handle is what the insert palette, the
    // markdown pipeline, paste, the turn-into list and `useAnchorTypes()` (the
    // reducer's `anchorTypes`) all read. The row's paint comes from the frame's
    // `anchor` below.
    Editor.Block({
      id: calloutBlock.type,
      match: calloutBlock.type,
      block: calloutBlock,
      component: CalloutNoRow,
    }),
    // Contributing a frame is what makes the callout a container: the surfaces
    // derive the framed-type set from this slot, group the callout's visible
    // subtree, and hand it here as children. `anchor` rides on the SAME
    // registration so a type cannot claim anchorhood without actually painting a
    // box (`./singularity check page-editor:anchor-has-decoration`).
    Editor.BlockFrame({
      match: calloutBlock.type,
      component: CalloutFrame,
      anchor: CalloutAnchor,
    }),
  ],
} satisfies PluginDefinition;
