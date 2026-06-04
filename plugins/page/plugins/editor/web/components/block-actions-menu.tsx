import { useState, type ReactElement } from "react";
import { MdDelete } from "react-icons/md";
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
        <div className="text-muted-foreground px-2 pt-1 text-xs font-medium uppercase tracking-wide">
          Turn into
        </div>
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
        <button
          type="button"
          className="text-destructive hover:bg-accent flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm"
          onMouseDown={(e) => {
            e.preventDefault();
            api.remove();
            setOpen(false);
          }}
        >
          <MdDelete className="size-4" />
          Delete
        </button>
      </div>
    </InlinePopover>
  );
}
