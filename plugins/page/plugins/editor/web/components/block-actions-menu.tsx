import { useState, type ReactElement } from "react";
import { MdDelete } from "react-icons/md";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Row } from "@plugins/primitives/plugins/row/web";
import { InlinePopover, type InlinePopoverProps } from "@plugins/primitives/plugins/popover/web";
import type { BlockEditorAPI } from "../types";
import { useInsertableBlocks, BlockTypeList } from "./block-type-list";

/**
 * Per-block actions popover, opened from the gutter drag handle. A single
 * popover (no nested submenus): a "Turn into" section listing insertable block
 * types (→ `api.convertTo`) and a "Delete" item (→ `api.remove`).
 */
export function BlockActionsMenu({
  trigger,
  api,
  align = "start",
  side = "bottom",
}: {
  trigger: ReactElement;
  api: BlockEditorAPI;
  align?: InlinePopoverProps["align"];
  side?: InlinePopoverProps["side"];
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const blocks = useInsertableBlocks();

  return (
    <InlinePopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setActiveIndex(-1);
      }}
      align={align}
      side={side}
      contentClassName="w-56 p-1"
      trigger={trigger}
    >
      <div className="flex flex-col gap-1">
        <Text
          as="div"
          variant="caption"
          className="text-muted-foreground px-2 pt-1 font-medium uppercase tracking-wide"
        >
          Turn into
        </Text>
        <BlockTypeList
          blocks={blocks}
          activeIndex={activeIndex}
          onHoverIndex={setActiveIndex}
          onSelect={(block) => {
            api.convertTo(block.type, block.empty?.() ?? {});
            setOpen(false);
          }}
        />
        <div className="bg-border my-0.5 h-px" />
        <Row
          className="text-destructive"
          icon={<MdDelete />}
          onMouseDown={(e: React.MouseEvent) => {
            e.preventDefault();
            api.remove();
            setOpen(false);
          }}
        >
          Delete
        </Row>
      </div>
    </InlinePopover>
  );
}
