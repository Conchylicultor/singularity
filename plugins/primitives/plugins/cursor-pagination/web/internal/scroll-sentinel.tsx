import type { RefObject } from "react";

export interface ScrollSentinelProps {
  sentinelRef: RefObject<HTMLDivElement | null>;
  show: boolean;
}

export function ScrollSentinel({
  sentinelRef,
  show,
}: ScrollSentinelProps): React.ReactElement | null {
  if (!show) return null;
  return <div ref={sentinelRef} className="h-px" />;
}
