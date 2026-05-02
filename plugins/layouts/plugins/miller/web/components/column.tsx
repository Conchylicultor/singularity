import { useLayoutEffect, useRef } from "react";
import {
  PaneDepthContext,
  type MatchEntry,
} from "@plugins/primitives/plugins/pane/web";
import { useColumnCollapse } from "../hooks/use-column-collapse";
import { hasStoredWidth, useColumnWidth } from "../hooks/use-column-widths";
import { CollapsedBar } from "./collapsed-bar";
import { ResizeHandle } from "./resize-handle";

const DEFAULT_WIDTH = 400;

interface ColumnProps {
  entry: MatchEntry;
  depth: number;
  isLast: boolean;
}

export function Column({ entry, depth, isLast }: ColumnProps) {
  const [collapsed, toggle] = useColumnCollapse(entry.pane.id);
  const [width, setWidth] = useColumnWidth(
    entry.pane.id,
    entry.pane.width ?? DEFAULT_WIDTH,
  );

  const divRef = useRef<HTMLDivElement>(null);
  // Tracks the actual rendered width while this column has flex-1 (isLast=true).
  const capturedWidthRef = useRef(0);

  // Keep capturedWidthRef up-to-date on every render while we're the last column.
  // No deps intentional: we need the latest measurement before the next column opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (isLast && divRef.current) {
      capturedWidthRef.current = divRef.current.offsetWidth;
    }
  });

  const setWidthRef = useRef(setWidth);
  setWidthRef.current = setWidth;
  const paneId = entry.pane.id;

  useLayoutEffect(() => {
    if (!isLast && capturedWidthRef.current > 0 && !hasStoredWidth(paneId)) {
      // First time a column opens to our right and the user hasn't set a custom
      // width: split the space 50/50 so both columns start roughly equal.
      setWidthRef.current(Math.round(capturedWidthRef.current / 2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLast, paneId]);

  if (collapsed && !isLast) {
    return <CollapsedBar entry={entry} onExpand={toggle} />;
  }

  const Component = entry.pane.component;

  return (
    <>
      <div
        ref={divRef}
        style={isLast ? undefined : { width }}
        className={
          isLast
            ? "flex h-full min-w-[200px] flex-1 flex-col overflow-hidden"
            : "flex h-full shrink-0 flex-col overflow-hidden"
        }
      >
        <PaneDepthContext.Provider value={depth}>
          <Component />
        </PaneDepthContext.Provider>
      </div>
      {!isLast && (
        <ResizeHandle
          onResize={(dx) => setWidth((w) => w + dx)}
          onCollapse={toggle}
        />
      )}
    </>
  );
}
