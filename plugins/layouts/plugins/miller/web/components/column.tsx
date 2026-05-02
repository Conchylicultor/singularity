import {
  PaneDepthContext,
  type MatchEntry,
} from "@plugins/primitives/plugins/pane/web";
import { useColumnCollapse } from "../hooks/use-column-collapse";
import { useColumnWidth } from "../hooks/use-column-widths";
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

  if (collapsed && !isLast) {
    return <CollapsedBar entry={entry} onExpand={toggle} />;
  }

  const Component = entry.pane.component;

  return (
    <>
      <div
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
