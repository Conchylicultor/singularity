import type { ReactNode } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { eventsApp } from "@plugins/apps/plugins/events/plugins/shell/core";
import { SourcesList } from "./components/sources-list";
import { useEventSource } from "./internal/use-source";
import { EventSourceDetail } from "./slots";

/** The Sources surface: `/events/sources`. */
export const eventSourcesPane = Pane.define({
  id: "event-sources",
  app: eventsApp,
  segment: "sources",
  component: EventSourcesPaneView,
  width: 380,
});

/**
 * One source: `/events/sources/source/:sourceId`.
 *
 * `defaultAncestors` keeps the list beside it as a Miller column, which is also
 * what puts the list segment in the URL — a pane's path is its ancestor chain,
 * so this cannot be the design doc's `/events/s/:id` without orphaning the list.
 *
 * The `source/` prefix is mandatory AND must be globally distinct, for two
 * separate reasons: `Pane.define` REJECTS a segment starting with a bare
 * `:param` (URL-parsing ambiguity), and pane segments are matched across the
 * whole app — param names do not disambiguate, so a short `s/:sourceId` collides
 * with Story's `s/:pageId` (`pane:segments-unique` catches it at build; left
 * unfixed it throws at runtime on navigation). Spelling the noun in full is the
 * same shape `deploy/servers` uses for `server/:serverId` under its `servers`
 * list.
 */
export const eventSourceDetailPane = Pane.define({
  id: "event-source-detail",
  app: eventsApp,
  defaultAncestors: [eventSourcesPane],
  segment: "source/:sourceId",
  component: EventSourceDetailPaneView,
  resolve: useResolveSource,
  width: 460,
});

function useResolveSource({ sourceId }: { sourceId: string }): {
  pending: boolean;
  found: boolean;
} {
  const lookup = useEventSource(sourceId);
  // An errored subscription is NOT "not found" — a deep link must not be
  // discarded because the socket blipped. Stay pending and let the body say so.
  if (lookup.status === "pending" || lookup.status === "error") {
    return { pending: true, found: false };
  }
  return { pending: false, found: lookup.status === "found" };
}

function EventSourcesPaneView(): ReactNode {
  return (
    <PaneChrome pane={eventSourcesPane} title="Sources">
      <SourcesList />
    </PaneChrome>
  );
}

function EventSourceDetailPaneView(): ReactNode {
  const { sourceId } = eventSourceDetailPane.useParams();
  const lookup = useEventSource(sourceId);

  if (lookup.status === "error") {
    return (
      <PaneChrome pane={eventSourceDetailPane} title="Source">
        <Placeholder tone="error">{lookup.error.message}</Placeholder>
      </PaneChrome>
    );
  }

  if (lookup.status === "missing") {
    return (
      <PaneChrome pane={eventSourceDetailPane} title="Source">
        <Placeholder>
          This source no longer exists, or it is outside the loaded window.
        </Placeholder>
      </PaneChrome>
    );
  }

  const title = lookup.status === "found" ? lookup.source.name : "Source";

  // The whole pane body is the one section slot: Settings, Schedule, Status and
  // Runs are peer contributions and the host owns every card. Sections render
  // while the lookup is still pending — each owns its own loading state, so the
  // pane does not stall behind one gate.
  return (
    <PaneChrome pane={eventSourceDetailPane} title={title}>
      <EventSourceDetail.Host sourceId={sourceId} />
    </PaneChrome>
  );
}
