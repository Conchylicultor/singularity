import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { IconPicker } from "@plugins/primitives/plugins/icon-picker/web";
import type { SvgNode } from "@plugins/primitives/plugins/icon-picker/core";
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
 * The callout's own appearance controls, rendered by `ContainerAnchor` above the
 * shared structural actions: colour swatches, the icon picker, and Reset.
 *
 * This is the whole of what is callout-SPECIFIC about its anchor menu — the
 * container primitive owns the trigger, the popover and the Remove/Delete
 * actions, and a container with no per-instance appearance (the context card)
 * simply contributes no sections at all.
 *
 * `close` is the shell's dismiss: the popover's open state belongs to
 * `ContainerAnchor`, so a control that commits and should dismiss says so rather
 * than owning a second copy of that state. The swatches deliberately do NOT
 * close — picking colours in a row is a comparison, not a commit.
 */
export function CalloutAppearance({
  color,
  icon,
  onChange,
  close,
}: {
  color: CalloutColor;
  icon: string | null;
  onChange: (next: Partial<CalloutIconChange>) => void;
  close: () => void;
}) {
  return (
    <>
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
          close();
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
          close();
        }}
        className="text-muted-foreground"
      >
        Reset
      </Row>
    </>
  );
}
