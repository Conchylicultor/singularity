import { useLayoutEffect, useRef } from "react";
import {
  PaneDepthContext,
  PaneLayoutContext,
  type MatchEntry,
} from "@plugins/primitives/plugins/pane/web";
import { useColumnCollapse } from "../hooks/use-column-collapse";
import { clearMaximize, getMaximizedId, useColumnMaximize } from "../hooks/use-column-maximize";
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
  const [collapsed, toggleCollapse] = useColumnCollapse(entry.pane.id);
  const [isMaximized, toggleMaximize] = useColumnMaximize(entry.pane.id);
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

  // Some other column is maximized → collapse this one (overrides isLast guard).
  const forcedCollapse = !isMaximized && getMaximizedId() !== null;
  if (forcedCollapse) {
    return <CollapsedBar entry={entry} onExpand={clearMaximize} />;
  }

  const isCollapsed = collapsed && !isLast;
  const keepMounted = entry.pane.chrome.keepMountedWhenCollapsed;

  if (isCollapsed && !keepMounted) {
    return <CollapsedBar entry={entry} onExpand={toggleCollapse} />;
  }

  // Maximized column fills all available space regardless of its position.
  const expandFull = isLast || isMaximized;

  const Component = entry.pane.component;

  // When keepMounted is true and the column is collapsed, the body div stays
  // mounted at tree position 0 (hidden via display:none) so the component
  // subtree is never torn down. The CollapsedBar takes position 1.
  return (
    <>
      <div
        ref={divRef}
        style={isCollapsed ? { display: "none" } : (expandFull ? undefined : { width })}
        className={
          isCollapsed
            ? undefined
            : expandFull
              ? "flex h-full min-w-[200px] flex-1 flex-col overflow-hidden"
              : "flex h-full shrink-0 flex-col overflow-hidden"
        }
      >
        <PaneDepthContext.Provider value={depth}>
          <PaneLayoutContext.Provider value={{ onDoubleClickHeader: toggleMaximize }}>
            <Component />
          </PaneLayoutContext.Provider>
        </PaneDepthContext.Provider>
      </div>
      {isCollapsed ? (
        <CollapsedBar entry={entry} onExpand={toggleCollapse} />
      ) : (
        !isLast && !isMaximized && (
          <ResizeHandle
            onResize={(dx) => setWidth((w) => w + dx)}
            onCollapse={toggleCollapse}
          />
        )
      )}
    </>
  );
}
