import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Editor } from "@plugins/page/plugins/editor/web";
import { ContainerNoRow } from "@plugins/page/plugins/container/web";
import { todoBlock } from "../core";
import { TodoAnchor } from "./components/todo-anchor";
import { TodoFrame } from "./components/todo-frame";

export { todoBlock } from "../core";

export default {
  description:
    "TODO block type: a void CONTAINER whose dashed box wraps blocks of any type nested inside it, marking a region of work agents still have to do. Also minted by typing `TODO ` at the start of a line.",
  contributions: [
    // The card renders NO row of its own — `BlockRow`'s anchored branch never
    // dispatches `Editor.Block` for an `anchor` type, so the container
    // primitive's shared null renderer is unreachable. The registration itself is
    // where the HANDLE lives, and the handle is what the insert palette, the
    // markdown pipeline, paste, the turn-into list, `useAnchorTypes()` and the
    // markdown-shortcut plugin (this block's `TODO ` prefix) all read.
    Editor.Block({
      id: todoBlock.type,
      match: todoBlock.type,
      block: todoBlock,
      component: ContainerNoRow,
    }),
    // Contributing a frame is what MAKES this a container: the framed-type set is
    // derived from this slot's registered matches (`useFramedBlockTypes()`), so
    // there is no second "I am a container" flag to drift from who actually
    // paints a box. `anchor` rides on the SAME registration
    // (`./singularity check page-editor:anchor-has-decoration`).
    Editor.BlockFrame({
      match: todoBlock.type,
      component: TodoFrame,
      anchor: TodoAnchor,
    }),
  ],
} satisfies PluginDefinition;
