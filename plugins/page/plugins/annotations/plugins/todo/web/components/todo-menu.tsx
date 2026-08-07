import type { Block } from "@plugins/page/plugins/editor/core";
import { TodoDispatch } from "@plugins/page/plugins/annotations/plugins/todo/plugins/task-link/web";

/**
 * The TODO card's section in the rail's block-actions menu
 * (`BlockFrameMeta.menu`), rendered above the generic structural actions
 * (Collapse / Remove TODO / Delete) that menu supplies for every container.
 *
 * The SAME panel the glyph's popover offers, on purpose and following the
 * callout: the rail is where a user looks for a block's actions, the glyph is
 * where they look for the glyph. They are not wired twice — both render
 * `TodoDispatch`, the one binding of the card's link to its launch form.
 *
 * `api` is deliberately unused: this panel writes no block data. It launches an
 * agent against the card's id, which the server resolves to a page on its own.
 */
export function TodoMenu({
  block,
  close,
}: {
  block: Block;
  close: () => void;
}) {
  return <TodoDispatch blockId={block.id} close={close} />;
}
