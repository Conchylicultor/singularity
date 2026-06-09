import type { ReactElement, ReactNode } from "react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

export interface WithTooltipProps {
  content: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  /** Extra classes for the tooltip popup (e.g. a wider `max-w-*`). */
  className?: string;
  children: ReactElement;
}

export function WithTooltip({ content, side, className, children }: WithTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side} className={className}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
