import type { MouseEvent } from "react";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { PAGE_BLOCK_TYPE, type Block } from "@plugins/page/plugins/editor/core";
import { useEditorScope } from "@plugins/page/plugins/editor/web";
import { usePageNavigation } from "@plugins/page/plugins/page-reference/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const openInNewIcon = symbol("open-in-new");

/**
 * "Open as page" in the block-actions menu: the block and its nested lines,
 * opened as a page of their own beside the current one.
 *
 * Absent — not disabled — in three cases, each a place where the row would
 * promise something that is not there:
 *
 * - the host declared no `openBlock` (a single-surface embed has nowhere to put
 *   a second view);
 * - the block is a sub-page row, which already opens as the page it is;
 * - the block is the one this view is already zoomed into — opening it again
 *   would open the view you are looking at.
 */
export function OpenAsPageItem({
  block,
  close,
}: {
  block: Block;
  close: () => void;
}) {
  const openBlock = usePageNavigation()?.openBlock;
  const { rootId } = useEditorScope();
  if (!openBlock) return null;
  if (block.type === PAGE_BLOCK_TYPE || block.id === rootId) return null;
  return (
    <Row
      icon={<Icon icon={openInNewIcon} className="text-muted-foreground" />}
      // `onMouseDown` + `preventDefault`, like the menu's other rows: the
      // editor keeps its focus until the action has run.
      onMouseDown={(e: MouseEvent) => {
        e.preventDefault();
        openBlock(block.id);
        close();
      }}
    >
      Open as page
    </Row>
  );
}
