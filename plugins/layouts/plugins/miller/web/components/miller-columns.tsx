import { useCallback, useContext, useLayoutEffect, useRef } from "react";
import { DeferredRouteFallback } from "@plugins/layouts/plugins/route-fallback/web";
import { scrollChildIntoView } from "@plugins/primitives/plugins/auto-scroll/web";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import {
  type PaneMatch,
  PaneBasePathContext,
  PaneInstanceContext,
  PaneMatchContext,
  usePaneRoute,
  usePaneStore,
} from "@plugins/primitives/plugins/pane/web";
import {
  SortableItem,
  SortableList,
} from "@plugins/primitives/plugins/sortable-list/web";
import { Column } from "./column";

export function MillerColumns({ match: provided }: { match?: PaneMatch } = {}) {
  const basePath = useContext(PaneBasePathContext);
  const store = usePaneStore();

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
      // Bring the newest (rightmost) column into view by scrolling only this
      // horizontal container to align its end — a container-scoped scroll that
      // never touches any ancestor's scroll position. Omitting `block` leaves
      // the vertical offset untouched.
      scrollChildIntoView(ref.current, ref.current.lastElementChild as HTMLElement | null, {
        inline: "end",
      });
    }
    lastLength.current = len;
  }, [match?.panes.length]);

  const handleMove = useCallback(
    (activeId: string, overId: string) => {
      const chain = store.getRoute();
      const fromIdx = chain.findIndex((s) => String(s.instanceId) === activeId);
      const toIdx = chain.findIndex((s) => String(s.instanceId) === overId);
      if (fromIdx >= 0 && toIdx >= 0) {
        store.reorderRoute(fromIdx, toIdx);
      }
    },
    [store],
  );

  // No matched route. During the post-paint deferred-load gap the pane the URL
  // points at may not be registered yet, so show a loading placeholder while
  // deferred loading is in progress; once it settles this falls back to null
  // (genuinely-invalid URL). See route-fallback for the full rationale.
  if (!match) return <DeferredRouteFallback />;

  const itemIds = match.panes.map((e) => String(e.instanceId));
  // Reordering only makes sense with 2+ columns. With a single pane there is
  // nowhere to drag it, so suppress the drag handle (and its grab cursor).
  const canReorder = match.panes.length > 1;

  const body = (
    <PluginErrorBoundary slot="layouts.miller" label={basePath}>
      {/* The horizontal flex row IS the x-scroll container: the SortableItem
          columns are its direct flex children, and the growth effect reveals
          this element's `lastElementChild` (the newest column) into view.
          flex-row + scroll-container can't be split without breaking the
          direct-child flex relationship dnd-kit relies on. */}
      {/* eslint-disable-next-line layout/no-adhoc-layout -- flex-row x-scroll container holding the sortable columns as direct children */}
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
                // The leaf column flex-grows to fill remaining width; fixed-width
                // columns stay rigid. The grow/shrink choice is per-column state,
                // so it stays raw.
                // eslint-disable-next-line layout/no-adhoc-layout -- per-column flex-grow/shrink role in miller's row
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
                        isFirst={i === 0}
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
