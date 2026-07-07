import type { ReactNode } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";

export interface ToolbarControlProps {
  /** Leading category icon (already sized, e.g. `<MdSpeed className="size-3.5" />`). */
  icon: ReactNode;
  /** Tooltip shown over the whole control. */
  tooltip: ReactNode;
  /** Dim + disable interaction (e.g. no song loaded). */
  disabled?: boolean;
  /** The control's segments — buttons, a ribbed wheel face, a readout, … */
  children: ReactNode;
}

/**
 * The shared chrome for Sonata's toolbar "dial" controls — the speed/spread jog
 * wheels and the transpose stepper. A compact bordered pill with a leading,
 * muted category icon followed by a row of segments. This frame owns the rounded
 * border, the tooltip, the no-song disabled dimming, and — crucially — the
 * leading icon's horizontal clearance from the rounded corner, so its glyph
 * never crowds the border (the old cross-control overlap glitch). Segment
 * dividers stay on the segments themselves (a `border-l`/`border-x`), not here,
 * so a control can divide its interior however it likes.
 */
export function ToolbarControl({
  icon,
  tooltip,
  disabled,
  children,
}: ToolbarControlProps) {
  return (
    <WithTooltip content={tooltip}>
      <Stack
        direction="row"
        align="center"
        gap="none"
        className={cn(
          "rounded-md border border-border",
          disabled && "pointer-events-none opacity-40",
        )}
      >
        {/* Horizontal clearance so the icon glyph doesn't crowd the rounded
            corner; vertical centering comes from the row's `align="center"`. */}
        <Inset x="xs" className="text-muted-foreground">
          {icon}
        </Inset>
        {children}
      </Stack>
    </WithTooltip>
  );
}
