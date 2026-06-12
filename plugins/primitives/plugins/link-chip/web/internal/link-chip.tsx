import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import type React from "react";

export interface LinkChipProps {
  /** Click handler. Callers own `e.stopPropagation()` — the primitive does not add it. */
  onClick: (e: React.MouseEvent) => void;
  /** StatusDot or icon, rendered before children. */
  leading?: React.ReactNode;
  /** Monospace label (for ids). Applies font-mono to the children wrapper. */
  mono?: boolean;
  title?: string;
  className?: string;
  /** Label (+ optional trailing count). */
  children: React.ReactNode;
}

export function LinkChip({
  onClick,
  leading,
  mono,
  title,
  className,
  children,
}: LinkChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex max-w-full items-center gap-xs rounded-md bg-muted p-chip align-baseline text-caption text-primary hover:bg-muted/80 hover:underline [&_svg:not([class*='size-'])]:icon-auto",
        className,
      )}
    >
      {leading}
      <span className={cn("truncate", mono && "font-mono")}>{children}</span>
    </button>
  );
}
