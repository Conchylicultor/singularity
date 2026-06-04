import { useCallback, useContext, useLayoutEffect, useMemo, useRef } from "react";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import {
  getChain,
  PaneBasePathContext,
  PaneInstanceContext,
  PaneMatchContext,
  reorderChain,
  setBasePath,
  useIndexMatch,
  useMatchForChain,
  useSyncPaneRegistry,
} from "@plugins/primitives/plugins/pane/web";
import {
  SortableItem,
  SortableList,
} from "@plugins/primitives/plugins/sortable-list/web";
import { Column } from "./column";

export function MillerColumns() {
  const basePath = useContext(PaneBasePathContext);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- synchronous write before useSyncPaneRegistry
  useMemo(() => { setBasePath(basePath); }, [basePath]);

  // Must run before useMatchForChain so the matcher sees the current
  // contribution set on first render. Must run AFTER setBasePath so that
  // the chain store sees the correct base path on initial load.
  useSyncPaneRegistry();

  // The opened chain is purely URL-derived (empty at a bare app root). When it
  // is empty, fall back to the active app's index/landing pane. Apps with no
  // `appPath`-scoped index render nothing (empty main area).
  const chainMatch = useMatchForChain();
  const indexMatch = useIndexMatch(basePath);
  const match = chainMatch ?? indexMatch;

  const ref = useRef<HTMLDivElement>(null);
  const lastLength = useRef(0);
  useLayoutEffect(() => {
    const len = match?.chain.length ?? 0;
    if (ref.current && len > lastLength.current) {
      ref.current.scrollLeft = ref.current.scrollWidth;
    }
    lastLength.current = len;
  }, [match?.chain.length]);

  const handleMove = useCallback((activeId: string, overId: string) => {
    const chain = getChain();
    const fromIdx = chain.findIndex((s) => String(s.instanceId) === activeId);
    const toIdx = chain.findIndex((s) => String(s.instanceId) === overId);
    if (fromIdx >= 0 && toIdx >= 0) {
      reorderChain(fromIdx, toIdx);
    }
  }, []);

  if (!match) return null;

  const itemIds = match.chain.map((e) => String(e.instanceId));
  // Reordering only makes sense with 2+ columns. With a single pane there is
  // nowhere to drag it, so suppress the drag handle (and its grab cursor).
  const canReorder = match.chain.length > 1;

  return (
    <PaneMatchContext.Provider value={match}>
      <PluginErrorBoundary slot="layouts.miller" label={basePath}>
        <div ref={ref} className="flex h-full overflow-x-auto">
          <SortableList
            items={itemIds}
            onMove={handleMove}
            orientation="horizontal"
          >
            {match.chain.map((entry, i) => {
              const isLast = i === match.chain.length - 1;
              return (
                <SortableItem
                  key={entry.instanceId}
                  id={String(entry.instanceId)}
                  handle
                  disabled={!canReorder}
                  className={(state) =>
                    `flex h-full${isLast ? " min-w-[200px] flex-1" : " shrink-0"}${state.isDragging ? " opacity-50" : ""}`
                  }
                >
                  {(state) => (
                    <PaneInstanceContext.Provider value={entry.instanceId}>
                      {/* Per-column boundary: a crash inside one pane is
                          contained to that column; sibling panes survive.
                          The outer boundary remains as a backstop for the
                          row scaffolding (SortableList, drag). */}
                      <PluginErrorBoundary
                        slot="layouts.miller"
                        label={entry.pane.id}
                      >
                        <Column
                          entry={entry}
                          isLast={isLast}
                          dragHandleProps={canReorder ? state.handleProps : undefined}
                        />
                      </PluginErrorBoundary>
                    </PaneInstanceContext.Provider>
                  )}
                </SortableItem>
              );
            })}
          </SortableList>
        </div>
      </PluginErrorBoundary>
    </PaneMatchContext.Provider>
  );
}
