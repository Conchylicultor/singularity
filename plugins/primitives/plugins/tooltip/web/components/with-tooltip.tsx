import type { ReactElement, ReactNode } from "react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

export interface WithTooltipProps {
  content: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactElement;
}

export function WithTooltip({ content, side, children }: WithTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>{content}</TooltipContent>
    </Tooltip>
  );
}
