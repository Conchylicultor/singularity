import { useCallback, useContext, useLayoutEffect, useRef } from "react";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import {
  getRoute,
  type PaneMatch,
  PaneBasePathContext,
  PaneInstanceContext,
  PaneMatchContext,
  reorderRoute,
  usePaneRoute,
} from "@plugins/primitives/plugins/pane/web";
import {
  SortableItem,
  SortableList,
} from "@plugins/primitives/plugins/sortable-list/web";
import { Column } from "./column";

export function MillerColumns({ match: provided }: { match?: PaneMatch } = {}) {
  const basePath = useContext(PaneBasePathContext);

  // Always run the self-resolve hooks to keep hook order stable; it is cheap
  // and idempotent. When a `match` prop is supplied (by the mixing host) we use
  // it instead and skip the `PaneMatchContext` provider, since the host has
  // already provided both the resolved match and the context.
  const selfMatch = usePaneRoute(basePath);
  const match = provided ?? selfMatch;

  const ref = useRef<HTMLDivElement>(null);
  const lastLength = useRef(0);
  useLayoutEffect(() => {
    const len = match?.panes.length ?? 0;
    if (ref.current && len > lastLength.current) {
      ref.current.scrollLeft = ref.current.scrollWidth;
    }
    lastLength.current = len;
  }, [match?.panes.length]);

  const handleMove = useCallback((activeId: string, overId: string) => {
    const chain = getRoute();
    const fromIdx = chain.findIndex((s) => String(s.instanceId) === activeId);
    const toIdx = chain.findIndex((s) => String(s.instanceId) === overId);
    if (fromIdx >= 0 && toIdx >= 0) {
      reorderRoute(fromIdx, toIdx);
    }
  }, []);

  if (!match) return null;

  const itemIds = match.panes.map((e) => String(e.instanceId));
  // Reordering only makes sense with 2+ columns. With a single pane there is
  // nowhere to drag it, so suppress the drag handle (and its grab cursor).
  const canReorder = match.panes.length > 1;

  const body = (
    <PluginErrorBoundary slot="layouts.miller" label={basePath}>
      <div ref={ref} className="flex h-full overflow-x-auto">
        <SortableList
          items={itemIds}
          onMove={handleMove}
          orientation="horizontal"
        >
          {match.panes.map((entry, i) => {
            const isLast = i === match.panes.length - 1;
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
  );

  // Standalone: provide the resolved match as context. Under the mixing host
  // (`match` prop supplied) the host already provides it — wrapping again would
  // be redundant, so render the body directly.
  return provided ? (
    body
  ) : (
    <PaneMatchContext.Provider value={match}>{body}</PaneMatchContext.Provider>
  );
}
