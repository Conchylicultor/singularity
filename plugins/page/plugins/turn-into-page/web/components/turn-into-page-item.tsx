import type { MouseEvent } from "react";
import { MdDescription } from "react-icons/md";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import type { BlockEditorAPI } from "@plugins/page/plugins/editor/web";
import type { Block } from "@plugins/page/plugins/editor/core";
import { turnBlockIntoPage } from "../internal/turn-block-into-page";

/**
 * "Page" entry in the block-actions "Turn into" section. Styled to match the
 * `BlockTypeList` rows (icon + label, `onMouseDown`/`preventDefault` so it does
 * not blur the editor before the action runs).
 *
 * Unlike its siblings this entry does not go through `api.convertTo`: turning a
 * block into a page re-scopes its whole subtree's `page_id`, which the row-level
 * patch pipeline behind `convertTo` cannot express (the server rejects such a
 * transition with a 409). It calls the dedicated atomic endpoint instead.
 */
export function TurnIntoPageItem({
  block,
  close,
}: {
  block: Block;
  api: BlockEditorAPI;
  close: () => void;
}) {
  return (
    <Row
      icon={<MdDescription className="text-muted-foreground" />}
      onMouseDown={(e: MouseEvent) => {
        e.preventDefault();
        void turnBlockIntoPage({ block });
        close();
      }}
    >
      Page
    </Row>
  );
}
