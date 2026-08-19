import { useMemo, type ReactElement, type ReactNode } from "react";
import {
  DataView,
  defineDataView,
  type CreateOption,
  type FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { matchResource } from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { useEventSources } from "@plugins/apps/plugins/events/plugins/events-core/web";
import {
  extractionStatus,
  type EventSource,
} from "@plugins/apps/plugins/events/plugins/events-core/core";
import { eventSourceDetailPane } from "../panes";
import { EventSourceActions } from "../slots";
import { useEventSourceTypes } from "../internal/source-types";
import {
  CADENCE_OPTIONS,
  EXTRACTION_STATUS_OPTIONS,
  SOURCE_STATUS_OPTIONS,
} from "../internal/format";
import { openAddSourceDialog } from "./add-source-dialog";
import { SourceRow } from "./source-row";

/**
 * The configured sources, config-backed like every DataView: the view instances
 * live only in `config/apps/events/sources/events.sources.jsonc`.
 */
const SOURCES_VIEW = defineDataView("events.sources");

export function SourcesList(): ReactNode {
  const result = useEventSources();
  const openPane = useOpenPane();
  const types = useEventSourceTypes();
  const selectedId = eventSourceDetailPane.useRouteEntry()?.params.sourceId;

  // Every dimension is a typed field, so search / filter / sort / group-by come
  // free — there are no bespoke filter chips on this toolbar, by design.
  //
  // `type`'s options are built from the live registry, never a literal list: a
  // third source type must widen this filter with zero edits here.
  const fields = useMemo<FieldDef<EventSource>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        type: "text",
        primary: true,
        value: (s) => s.name,
      },
      {
        id: "type",
        label: "Type",
        type: "enum",
        options: types.map((t) => ({ value: t.id, label: t.label })),
        value: (s) => s.type,
      },
      {
        id: "refresh",
        label: "Cadence",
        type: "enum",
        options: CADENCE_OPTIONS,
        value: (s) => s.refresh,
      },
      {
        id: "status",
        label: "Status",
        type: "enum",
        options: SOURCE_STATUS_OPTIONS,
        value: (s) => s.status,
      },
      // A DERIVED dimension: there is no `extraction` column — it is computed
      // by `extractionStatus` from the two the run ledger writes. Fine exactly
      // here — this DataView is client-side over a bounded live window, so
      // filter / sort / group-by run over the rows already in hand and need no
      // server binding. (A server-delegated view, like `event-list`, could not
      // do this: its filters compile to SQL against real columns.)
      //
      // It is the dimension that answers the question `status` cannot —
      // "which of my sources are silently returning nothing" — so it is what
      // the `Needs attention` view should be filtering on.
      {
        id: "extraction",
        label: "Extraction",
        type: "enum",
        options: EXTRACTION_STATUS_OPTIONS,
        value: (s) => extractionStatus(s),
      },
      {
        id: "enabled",
        label: "Enabled",
        type: "bool",
        value: (s) => s.enabled,
      },
      {
        id: "lastRunAt",
        label: "Last run",
        type: "date",
        value: (s) => s.lastRunAt,
        align: "end",
      },
    ],
    [types],
  );

  // The `+` menu IS the registry: one creator per installed source type, in
  // contributed order. Nothing here names a type, so adding one is zero edits.
  const creators = useMemo<CreateOption[]>(
    () =>
      types.map((t) => {
        const Icon = t.icon;
        return {
          id: t.id,
          label: t.label,
          icon: Icon ? <Icon className="icon-auto" /> : undefined,
          onSelect: () =>
            openAddSourceDialog(t, (sourceId) =>
              openPane(eventSourceDetailPane, { sourceId }, { mode: "push" }),
            ),
        };
      }),
    [types, openPane],
  );

  const renderList = (
    sources: EventSource[],
    loading: boolean,
  ): ReactElement => (
    <DataView<EventSource>
      storageKey={SOURCES_VIEW}
      rows={sources}
      fields={fields}
      rowKey={(s) => s.id}
      views={["list", "table"]}
      loading={loading}
      creators={creators}
      itemActions={EventSourceActions}
      selectedRowId={selectedId}
      onRowActivate={(s) =>
        openPane(eventSourceDetailPane, { sourceId: s.id }, { mode: "push" })
      }
      viewOptions={{
        list: {
          size: "md",
          renderRow: (s: EventSource) => <SourceRow source={s} />,
        },
      }}
      emptyState={
        types.length === 0
          ? "No source types are installed, so there is nothing to add yet."
          : "No sources yet — use + to add one."
      }
    />
  );

  // One render path for loading and ready: while loading the DataView paints its
  // own skeleton and the toolbar (search / +) stays put, so a loading list can
  // never masquerade as a confirmed-empty one. A broken subscription is NOT
  // folded into that — it gets its own visible message rather than an eternal
  // skeleton the user reads as "no sources".
  return matchResource(result, {
    pending: () => renderList([], true),
    error: (error) => <Placeholder tone="error">{error.message}</Placeholder>,
    ready: (sources) => renderList(sources, false),
  });
}
