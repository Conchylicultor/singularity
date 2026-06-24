import { cn, Popover, PopoverContent, PopoverTrigger } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useState } from "react";
import { MdLightbulb } from "react-icons/md";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { IconPicker } from "@plugins/primitives/plugins/icon-picker/web";
import type { SvgNode } from "@plugins/primitives/plugins/icon-picker/core";
import { PageIcon } from "@plugins/page/plugins/editor/web";
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
 * The callout's leading icon: a glyph that opens a popover to pick a semantic
 * color and a Material Design icon. Mirrors `PageIconButton` / `AvatarPicker`.
 * Lives inside the editor's contenteditable, so the trigger and swatches
 * preventDefault on mousedown to keep the caret put (like the to-do checkbox).
 */
export function CalloutIcon({
  color,
  icon,
  iconSvgNodes,
  onChange,
  className,
}: {
  color: CalloutColor;
  icon: string | null;
  iconSvgNodes: SvgNode[] | null;
  onChange: (next: Partial<CalloutIconChange>) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        onMouseDown={(e) => e.preventDefault()}
        // eslint-disable-next-line layout/no-adhoc-layout -- flex-none + self-start are per-child overrides positioning the trigger as a rigid, top-aligned leading glyph within the callout block's row (owned by the parent, not this file)
        className={cn(
          "hover:bg-accent size-7 flex-none self-start rounded-md py-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
      </PopoverContent>
    </Popover>
  );
}
