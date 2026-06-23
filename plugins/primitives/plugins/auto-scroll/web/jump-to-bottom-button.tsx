import { Button, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ReactElement, ReactNode } from "react";
import { MdExpandMore } from "react-icons/md";
import type { StickyScrollHandle } from "./use-sticky-scroll";

/**
 * The button only needs the view state + the jump action — never the
 * `scrollRef`. Narrowing the prop to this ref-free slice keeps a tainted ref
 * object out of the component's surface: consumers can hand it the destructured
 * pin/unread/jump fields (a plain object) instead of the whole handle, so
 * passing it never trips the "cannot access ref during render" rule. A full
 * `StickyScrollHandle` still satisfies this structurally.
 */
export type JumpToBottomView = Pick<
  StickyScrollHandle,
  "isPinned" | "hasUnread" | "jumpToBottom"
>;

export interface JumpToBottomButtonProps {
  handle: JumpToBottomView;
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
      onClick={handle.jumpToBottom}
      aria-label="Jump to bottom"
      className={cn("gap-xs rounded-full shadow-md", className)}
    >
      <MdExpandMore className="size-4" />
      {label}
    </Button>
  );
}
