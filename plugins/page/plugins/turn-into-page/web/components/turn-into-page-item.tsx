import type { MouseEvent } from "react";
import { MdDescription } from "react-icons/md";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { useBlockEditor, type BlockEditorAPI } from "@plugins/page/plugins/editor/web";
import type { Block } from "@plugins/page/plugins/editor/core";
import { turnBlockIntoPage } from "../internal/turn-block-into-page";

/**
 * "Page" entry in the block-actions "Turn into" section. Styled to match the
 * `BlockTypeList` rows (icon + label, `onMouseDown`/`preventDefault` so it does
 * not blur the editor before the action runs).
 */
export function TurnIntoPageItem({
  block,
  api,
  close,
}: {
  block: Block;
  api: BlockEditorAPI;
  close: () => void;
}) {
  const { pageId, blocks, bulkMove } = useBlockEditor();
  return (
    <Row
      icon={<MdDescription className="text-muted-foreground" />}
      onMouseDown={(e: MouseEvent) => {
        e.preventDefault();
        void turnBlockIntoPage({ block, api, pageId, blocks, bulkMove });
        close();
      }}
    >
      Page
    </Row>
  );
}
