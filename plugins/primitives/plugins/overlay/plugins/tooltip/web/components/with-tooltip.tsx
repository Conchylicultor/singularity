import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useState, type ReactElement, type ReactNode } from "react";

export interface WithTooltipProps {
  content: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  /** Extra classes for the tooltip popup (e.g. a wider `max-w-*`). */
  className?: string;
  /**
   * A click on the trigger pins the tooltip open (and a second click unpins
   * it), on top of the usual hover. For a trigger whose tooltip IS its content
   * — a status mark with nothing else to do on click — so the click that
   * people try first shows it, and it stays up while they read. A click
   * elsewhere or Esc closes it.
   */
  pinOnClick?: boolean;
  children: ReactElement;
}

export function WithTooltip({
  content,
  side,
  className,
  pinOnClick = false,
  children,
}: WithTooltipProps) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const body = (
    <TooltipContent side={side} className={className}>
      {content}
    </TooltipContent>
  );
  if (!pinOnClick) {
    return (
      <Tooltip>
        <TooltipTrigger render={children} />
        {body}
      </Tooltip>
    );
  }
  // Hover is tracked on the trigger itself: once the popup is held open by
  // the controlled `open`, base-ui stops reporting a later hover-in, so hover
  // would never reopen it after a pinned close. base-ui still owns focus and
  // the dismissals (Esc, a click elsewhere), which unpin.
  return (
    <Tooltip
      open={pinned || hovered || focused}
      onOpenChange={(open, { reason }) => {
        if (reason === "outside-press" || reason === "escape-key") {
          setPinned(false);
          setHovered(false);
          setFocused(false);
        } else if (reason === "trigger-focus") setFocused(open);
      }}
    >
      <TooltipTrigger
        render={children}
        closeOnClick={false}
        onClick={() => {
          // Unpinning closes it even under the pointer: the click said "away".
          if (pinned) setHovered(false);
          setPinned(!pinned);
        }}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      />
      {body}
    </Tooltip>
  );
}
