import { useState, type ReactElement } from "react";
import { InlinePopover, type InlinePopoverProps } from "@plugins/primitives/plugins/popover/web";
import type { PopoverWidth, PopoverPadding } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { BlockHandle } from "../../core";
import { useInsertableBlocks } from "./block-type-list";
import { BlockTypePicker } from "./block-type-picker";

/**
 * Uncontrolled popover that lets the user pick an insertable block type, then
 * reports it to `onSelect` — a "pick, THEN create" affordance (the bottom
 * Add-block menu, the turn-into menu). The gutter `+` uses the inverse flow —
 * create THEN type, over the shared caret menu; see `BlockMenuPlugin` /
 * `useInsertBlockBelow`.
 *
 * The picker body (filter field + keyboard nav) lives in `BlockTypePicker`; the
 * body is unmounted while closed, so its query resets on every open.
 */
export function BlockTypeMenu({
  trigger,
  onSelect,
  align = "start",
  side = "bottom",
  width = "sm",
  padding = "xs",
}: {
  trigger: ReactElement;
  onSelect: (block: BlockHandle<unknown>) => void;
  align?: InlinePopoverProps["align"];
  side?: InlinePopoverProps["side"];
  width?: PopoverWidth;
  padding?: PopoverPadding;
}) {
  const [open, setOpen] = useState(false);
  const blocks = useInsertableBlocks();

  if (blocks.length === 0) return null;

  return (
    <InlinePopover
      open={open}
      onOpenChange={setOpen}
      align={align}
      side={side}
      width={width}
      padding={padding}
      trigger={trigger}
    >
      <BlockTypePicker
        onSelect={(block) => {
          onSelect(block);
          setOpen(false);
        }}
        onDismiss={() => setOpen(false)}
      />
    </InlinePopover>
  );
}
