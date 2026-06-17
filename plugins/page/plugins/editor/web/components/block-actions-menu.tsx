import { useState, type ReactElement } from "react";
import { MdDelete } from "react-icons/md";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { InlinePopover, type InlinePopoverProps } from "@plugins/primitives/plugins/popover/web";
import type { Block } from "../../core";
import type { BlockEditorAPI } from "../types";
import { Editor } from "../slots";
import { useInsertableBlocks, BlockTypeList } from "./block-type-list";

/**
 * Per-block actions popover, opened from the gutter drag handle. A single
 * popover (no nested submenus): a "Turn into" section listing insertable block
 * types (→ `api.convertTo`) plus any `Editor.TurnInto` contributions, and a
 * "Delete" item (→ `api.remove`).
 */
export function BlockActionsMenu({
  trigger,
  block,
  api,
  align = "start",
  side = "bottom",
}: {
  trigger: ReactElement;
  block: Block;
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
      contentClassName="w-56 p-xs"
      trigger={trigger}
    >
      <Stack gap="xs">
        <Text
          as="div"
          variant="caption"
          className="text-muted-foreground px-sm pt-xs font-medium uppercase tracking-wide"
        >
          Turn into
        </Text>
        <BlockTypeList
          blocks={blocks}
          activeIndex={activeIndex}
          onHoverIndex={setActiveIndex}
          onSelect={(handle) => {
            api.convertTo(handle.type, handle.empty?.() ?? {});
            setOpen(false);
          }}
        />
        <Editor.TurnInto.Render>
          {(a) => <a.component block={block} api={api} close={() => setOpen(false)} />}
        </Editor.TurnInto.Render>
        {/* eslint-disable-next-line spacing/no-adhoc-spacing -- my-0.5 is a hairline separator's own inset between the menu's two zones; not a Stack-gap rhythm (the surrounding gap-xs is intentionally tighter) */}
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
      </Stack>
    </InlinePopover>
  );
}
