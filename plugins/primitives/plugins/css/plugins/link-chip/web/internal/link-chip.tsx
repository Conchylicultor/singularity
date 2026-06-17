import { Badge } from "@plugins/primitives/plugins/badge/web";
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
    <Badge
      as="button"
      type="button"
      onClick={onClick}
      title={title}
      icon={leading}
      mono={mono}
      colorClass="bg-muted text-primary hover:bg-muted/80 hover:underline"
      className={className}
    >
      {children}
    </Badge>
  );
}
