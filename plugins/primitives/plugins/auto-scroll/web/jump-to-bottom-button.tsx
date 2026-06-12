import { Button, cn } from "@plugins/primitives/plugins/ui-kit/web";
import type { ReactElement, ReactNode } from "react";
import { MdExpandMore } from "react-icons/md";
import type { StickyScrollHandle } from "./use-sticky-scroll";

export interface JumpToBottomButtonProps {
  handle: StickyScrollHandle;
  className?: string;
  /** Optional content rendered next to the chevron (e.g. "3 new"). */
  label?: ReactNode;
}

export function JumpToBottomButton({
  handle,
  className,
  label,
}: JumpToBottomButtonProps): ReactElement | null {
  if (handle.isPinned && !handle.hasUnread) return null;
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={handle.jumpToBottom}
      aria-label="Jump to bottom"
      className={cn("gap-xs rounded-full shadow-md", className)}
    >
      <MdExpandMore className="size-4" />
      {label}
    </Button>
  );
}
