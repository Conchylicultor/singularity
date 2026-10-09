import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const refreshIcon = symbol("refresh");

export interface SpinnerProps {
  spinning?: boolean;
  /**
   * What spins. `glyph` (the default): the refresh icon. `ring`: a thin ring
   * whose faint track is the surface's hover tone and whose arc is the current
   * text colour — a quieter mark for a status sitting beside its own label
   * (the Build tray's "Building"). Sized by `className`, like the glyph.
   */
  shape?: "glyph" | "ring";
  className?: string;
}

export function Spinner({
  spinning = true,
  shape = "glyph",
  className,
}: SpinnerProps) {
  if (shape === "ring")
    return (
      <span
        aria-hidden
        className={cn(
          "inline-block shrink-0 rounded-full border-2 border-hover-fill border-t-current",
          spinning && "animate-spin",
          className,
        )}
      />
    );
  return (
    <Icon
      icon={refreshIcon}
      className={cn(spinning && "animate-spin", className)}
    />
  );
}
