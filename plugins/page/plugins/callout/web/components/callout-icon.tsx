import { cn, Popover, PopoverContent, PopoverTrigger } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useState } from "react";
import { MdDelete, MdLightbulb, MdRemoveCircleOutline } from "react-icons/md";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { IconPicker } from "@plugins/primitives/plugins/icon-picker/web";
import type { SvgNode } from "@plugins/primitives/plugins/icon-picker/core";
import { PageIcon, useBlockEditor, type BlockEditorAPI } from "@plugins/page/plugins/editor/web";
import { CALLOUT_COLORS, type CalloutColor } from "../../core";

/** Solid swatch dot per semantic color, shown in the color row of the popover. */
const COLOR_SWATCH: Record<CalloutColor, string> = {
  default: "bg-muted-foreground/40",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
};

export interface CalloutIconChange {
  icon: string | null;
  iconSvgNodes: SvgNode[] | null;
  color: CalloutColor;
}

/**
 * The callout's icon on an EDITABLE surface: the container's one and only
 * affordance.
 *
 * An anchor row renders no hover rail — its three slots would coincide with its
 * first child's, on the same visual line, and the child must keep its own handle
 * (see `page/editor`'s "A container that owns no text"). So everything an
 * ordinary block gets from the gutter drag handle has to live here: the surface
 * owns drag-to-move (the column this renders into is the draggable), and this
 * popover owns the rest — appearance (colour, icon, reset) plus the two
 * structural actions, mirroring `BlockActionsMenu`'s shape and its
 * `onMouseDown`-preventDefault commit.
 *
 * "Remove callout" DISSOLVES the container and promotes its children into its
 * slot (`unwrapBlock`) — the escape hatch that keeps the content. "Delete"
 * removes the callout and its whole subtree, exactly as the block-actions menu's
 * Delete does for any other block. Two different intents that a single
 * "delete the container" would conflate.
 *
 * The trigger sits beside a live caret, so it `preventDefault`s its mousedown to
 * keep that caret put (like the to-do checkbox). It fills the surface-owned
 * `BLOCK_INDENT` column exactly — it must not size or place itself.
 */
export function CalloutIcon({
  blockId,
  color,
  icon,
  iconSvgNodes,
  editor,
  onChange,
  className,
}: {
  blockId: string;
  color: CalloutColor;
  icon: string | null;
  iconSvgNodes: SvgNode[] | null;
  editor: BlockEditorAPI;
  onChange: (next: Partial<CalloutIconChange>) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { unwrapBlock } = useBlockEditor();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onMouseDown={(e) => e.preventDefault()}
        className={cn(
          "hover:bg-accent size-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        aria-label="Callout icon and color"
      >
        <Center className="size-full">
          <PageIcon nodes={iconSvgNodes} fallback={MdLightbulb} className="size-5" />
        </Center>
      </PopoverTrigger>
      <PopoverContent width="xl" padding="sm" align="start">
        {/* Color row */}
        <SectionLabel className="px-xs pt-xs pb-xs text-3xs">Color</SectionLabel>
        <Stack direction="row" gap="xs" wrap className="px-xs pb-sm">
          {CALLOUT_COLORS.map((key) => (
            <button
              key={key}
              type="button"
              aria-label={key}
              aria-pressed={color === key}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange({ color: key })}
              className={cn(
                "size-5 rounded-full border border-border transition-transform",
                COLOR_SWATCH[key],
                color === key && "scale-110 ring-2 ring-ring ring-offset-1 ring-offset-background",
              )}
            />
          ))}
        </Stack>

        {/* Icon picker */}
        <IconPicker
          value={icon}
          onSelect={({ key, svgNodes }) => {
            onChange({ icon: key, iconSvgNodes: svgNodes });
            setOpen(false);
          }}
        />

        {/* Reset */}
        {/* eslint-disable-next-line spacing/no-adhoc-spacing -- one-off vertical offset on a hairline divider, matching avatar-picker / page-icon-button */}
        <div className="my-1 h-px bg-border" />
        <Row
          size="sm"
          hover="accent"
          onClick={() => {
            onChange({ icon: null, iconSvgNodes: null, color: "default" });
            setOpen(false);
          }}
          className="text-muted-foreground"
        >
          Reset
        </Row>

        {/* Structural actions — the block-actions menu this container has no
            gutter handle to open. Same `onMouseDown` + preventDefault commit as
            `BlockActionsMenu`'s Delete, so the press never blurs a live caret. */}
        {/* eslint-disable-next-line spacing/no-adhoc-spacing -- hairline separator's own inset between the menu's zones, matching the Reset divider above */}
        <div className="my-1 h-px bg-border" />
        <Row
          size="sm"
          hover="accent"
          icon={<MdRemoveCircleOutline />}
          onMouseDown={(e: React.MouseEvent) => {
            e.preventDefault();
            unwrapBlock(blockId);
            setOpen(false);
          }}
        >
          Remove callout
        </Row>
        <Row
          size="sm"
          hover="accent"
          className="text-destructive"
          icon={<MdDelete />}
          onMouseDown={(e: React.MouseEvent) => {
            e.preventDefault();
            editor.remove();
            setOpen(false);
          }}
        >
          Delete
        </Row>
      </PopoverContent>
    </Popover>
  );
}
