# sources

Everything about **sources** — both the UI for managing configured instances and
the umbrella for the *source types* themselves.

- **This plugin's `web/`** is the UI: the `Events.Sidebar` entry, the sources
  DataView (`events.sources`) with its registry-driven `+` menu, the side-pane at
  `/events/sources/source/:sourceId`, and the `EventSourceDetail` section slot its
  regions contribute into. It also exports the generic pieces the sections reuse
  (`SourceConfigForm`, `useEventSource`, `useEventSourceType`,
  `readConfigValues`, the label maps).
- **`plugins/source-detail/`** — the side-pane's regions, one sub-plugin each.
- **`plugins/source-field/`** — the `source` dimension of the *events* DataView.
- **`plugins/refresh-all/`** — the pane's Refresh-all button.
- **`plugins/url-extract/`, `plugins/manual/`, `plugins/dmda/`,
  `plugins/salsanueva/`** — the source types.

Naming: a **source** is a configured instance (a row in `event_sources`); a
**source type** is the plugin that knows how to read that kind of thing.

## The UI names no source type, ever

The `+` menu is built from `EventSources.Type.useContributions()` and the
configuration form is rendered from each type's `configFields` through
`config_v2`'s `FieldRenderer`. **A source type therefore ships zero form code**,
and a third type drops into this UI with zero edits here. The moment a file under
`web/` mentions a type id, that promise is gone — a type needing bespoke chrome
contributes `Extra` instead.

The one exception is deliberate and generic: an *unregistered* type (its plugin
uninstalled) is rendered as an explicit "not installed" state rather than an
empty form, in both the row and the Settings section.

## The list: the row IS the field schema

There is **no row component**. The list draws itself from `FieldDef[]` — primary
field as the title, `align:"end"` trailing, the rest as the subtitle run — so
`sources-list.tsx` declares dimensions and the DataView primitive decides what a
row looks like. (It did have a hand-written two-line row, `SourceRow`, until the
primitive learned the three things that row was there for: an option's own tint
and tooltip, per-row tone, and a field that is a dimension without being
printed. Design:
[`research/2026-08-25-global-data-view-field-driven-row-tint-tone-visibility.md`](../../../../../../research/2026-08-25-global-data-view-field-driven-row-tint-tone-visibility.md).)

Two of the seven fields are derived, with **no column behind them** — legal here
only because this DataView is client-side over a bounded live window, so
filter/sort/group-by run over the rows already in hand and need no server
binding:

- `extraction` (never / ok / empty / failed, from `extractionStatus`) — the
  dimension that answers "which sources are silently returning nothing";
  `status` cannot.
- `state` (from `sourceState`) — the ONE word the row prints, with a three-way
  precedence: `Disabled` > `Running` > the extraction status. `Disabled` wins
  because a switched-off source's extraction status describes a past the row no
  longer lives in — `Failed` on a source you turned off last month is asking for
  attention you already gave. Below it, `running` wins while a run is in flight.
  `idle` and `error` are never reachable: `idle` is a constant on a healthy
  source, and `error` is subsumed (a terminal failure also writes a failed run;
  a transient one leaves `status: idle` while the extraction status still says
  `failed`).

The three fields `state` is derived from — `status`, `extraction`, `enabled` —
are declared `visible: false`. They stay full sort / filter / group-by
dimensions (`Needs attention` filters on two of them) and the user can switch
any of them back on from Properties; they are simply not printed, because
printing them beside `state` is the same fact three times.

Each state's word, tint and tooltip travel on its **option**
(`SOURCE_STATE_OPTIONS` in `web/internal/format.ts`), not on a render site — the
chip cell reads them off the option, so there is no label-map-plus-variant-map
pair for anyone to join by hand. The maps stay exported for the surfaces outside
a DataView that still paint a chip themselves (the source-detail Status section,
the run rows).

A disabled source's whole line is dimmed, via `rowTone` — so it reads "off"
before a word is read, which is what lets the row spend its one verdict chip on
the state rather than on saying "off" twice. The table view deliberately does
not tone its rows.

The `type` field carries the list's only per-field `cell`, for the one state an
option list cannot hold: a source whose type plugin is not installed has no
option, so the generic chip would print the bare id and the row would look like
every other one. It still names no type — the id comes from the row.

For the same reason `Disabled` outranks the extraction status, the `Needs
attention` view (authored in
`config/apps/events/sources/events.sources.jsonc`) ANDs `enabled is true` onto
its unhealthy-extraction filter: you switched it off, so it is not a complaint.

Row actions are a slot, ordered non-destructive-first: `enabled` then `delete`.
The `enabled` action is a real `role="switch"` — the control shows its own state
(knob and filled track), where the pause/play glyph it replaced left the reader
guessing whether the icon described the source or the click. That matters here
because row actions only appear on hover, so a state the control can only state
through its label is a state nobody sees at rest; the `Disabled` chip and the
dimmed line carry it the rest of the time. Disabling also drops the source's
events out of the events list — a query-time default in `event-list`, not a
delete, so re-enabling restores them.

## Source-type wiring (unchanged)

Each source type owns its own three-way wiring; nothing here aggregates them, and
the registries live in `events-core` (`defineEventSourceType` on the server, the
`EventSources.Type` slot on the web):

- `core/` — the type id plus its `configFields` (`FieldsRecord`). Web-safe, so
  the same record validates the row's `config` jsonb server-side and renders the
  form on the web.
- `server/` — `defineEventSourceType({ id, configFields, probe, extract })`.
- `web/` — one `EventSources.Type({ id, label, icon, configFields })`.

Two independent one-way imports (sub-plugin web → `events-core/web`, sub-plugin
server → `events-core/server`), never web↔server inside a sub-plugin. A source
type does **not** import this plugin.

## Route shape

`/events/sources` and `/events/sources/source/:sourceId`. The detail pane declares
the list as `defaultAncestors` (so they sit side by side as Miller columns), and a
pane's URL is its ancestor chain — which is why the design doc's `/events/s/:id`
is not reachable without orphaning the list.

Do not shorten `source/` to `s/`: `Pane.define` throws on a segment starting with
a bare `:param`, and segments are matched **globally** across apps where param
names don't disambiguate — `s/:sourceId` collides with Story's `s/:pageId`. Same
shape as `deploy/servers`' `server/:serverId`.

Creating a source is a dialog, not a `new` sentinel route, so `:sourceId` means
exactly one thing.

Design: [`research/2026-08-03-apps-events-event-tracking-app.md`](../../../../../../research/2026-08-03-apps-events-event-tracking-app.md).

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: The Events app's Sources surface: the sidebar entry, the sources DataView with a registry-driven `+` menu, and the per-source side-pane whose sections are contributions. Renders every source type's configuration form generically from its `configFields`, so a source type ships no form code.
- Web:
  - Slots:
    - `EventSourceDetail.Section` ← `apps.events.sources.source-detail.runs`, `apps.events.sources.source-detail.schedule`, `apps.events.sources.source-detail.settings`, `apps.events.sources.source-detail.status`
    - `EventSourceActions` ← `apps.events.sources`
    - `eventSourcesPane.Actions` ← `apps.events.sources.refresh-all`, `primitives.pane`
    - `eventSourceDetailPane.Actions` ← `primitives.pane`
  - Contributes:
    - `Pane.Register` "event-sources"
    - `Pane.Register` "event-source-detail"
    - `Events.Sidebar` "Sources" → `component`
    - `EventSourceActions` "enabled" → `SourceToggleAction`
    - `EventSourceActions` "delete" → `SourceDeleteAction`
  - Uses:
    - `apps/events/events-core.EventSources`
    - `apps/events/events-core.useCreateEventSource`
    - `apps/events/events-core.useDeleteEventSource`
    - `apps/events/events-core.useEventSources`
    - `apps/events/events-core.useUpdateEventSource`
    - `apps/events/shell.Events`
    - `config_v2/fields.FieldRenderer`
    - `infra/endpoints.getEndpointErrorMessage`
    - `primitives/app-shell.sidebarNavItem`
    - `primitives/css/badge.Badge`
    - `primitives/css/fill.Fill`
    - `primitives/css/line.Line`
    - `primitives/css/placeholder.Placeholder`
    - `primitives/css/spacing.Stack`
    - `primitives/css/switch.Switch`
    - `primitives/css/text.Text`
    - `primitives/css/toggle-chip.SegmentedControl`
    - `primitives/css/ui-kit.Button`
    - `primitives/css/ui-kit.DialogDescription`
    - `primitives/css/ui-kit.DialogTitle`
    - `primitives/css/ui-kit.Input`
    - `primitives/data-view.CreateOption`
    - `primitives/data-view.DataView`
    - `primitives/data-view.defineDataView`
    - `primitives/data-view.defineItemActions`
    - `primitives/data-view.FieldDef`
    - `primitives/detail-sections.defineDetailSections`
    - `primitives/icon-button.IconButton`
    - `primitives/imperative-dialog.openDialog`
    - `primitives/live-state.matchResource`
    - `primitives/pane.openPane`
    - `primitives/pane.Pane`
    - `primitives/pane.PaneChrome`
    - `primitives/pane.useOpenPane`
    - `primitives/tooltip.WithTooltip`
  - Exports (types):
    - `ConfigValues`
    - `EventSourceTypeContribution`
    - `SourceConfigFormProps`
    - `SourceLookup`
    - `SourceTypeLookup`
  - Exports (values):
    - `CADENCE_LABEL`
    - `CADENCE_OPTIONS`
    - `describeRun`
    - `EventSourceActions`
    - `EventSourceDetail`
    - `eventSourceDetailPane`
    - `eventSourcesPane`
    - `EXTRACTION_STATUS_HINT`
    - `EXTRACTION_STATUS_LABEL`
    - `EXTRACTION_STATUS_OPTIONS`
    - `EXTRACTION_STATUS_VARIANT`
    - `formatDuration`
    - `initialConfigValues`
    - `readConfigValues`
    - `RUN_OUTCOME_LABEL`
    - `RUN_OUTCOME_OPTIONS`
    - `RUN_OUTCOME_VARIANT`
    - `SOURCE_STATE_OPTIONS`
    - `SOURCE_STATUS_LABEL`
    - `SOURCE_STATUS_OPTIONS`
    - `SOURCE_STATUS_VARIANT`
    - `SourceConfigForm`
    - `useEventSource`
    - `useEventSourceType`
    - `useEventSourceTypes`
- Cross-plugin:
  - Imported by:
    - `apps/events/sources/refresh-all`
    - `apps/events/sources/source-detail/runs`
    - `apps/events/sources/source-detail/schedule`
    - `apps/events/sources/source-detail/settings`
    - `apps/events/sources/source-detail/status`
- Sub-plugins:
  - **`dmda`** — Des Mots et Des Arts source type in the Events `+` menu: contributes the `dmda` type with its generic category picker. Des Mots et Des Arts event source type: probe reads the site's own paginated JSON listing (SSRF-guarded) and fingerprints its identity fields; extract maps the rows to events with no model call, resolving the year the site omits from the weekday it publishes.
  - **`manual`** — Manual event source type: contributes the hand-entry option to the Events `+` source menu. Zero-config — the user is the extractor, so there is nothing to point it at. Hand-entry event source type: probe reports a constant fingerprint (nothing upstream can change) and extract vouches for the source's own live rows, so a refresh can never bury events the user typed.
  - **`refresh-all`** — Refresh-all action in the Events sources pane toolbar: one request that enqueues a run for every ENABLED source, with the enqueued / already-running / skipped tally rendered arm by arm as a toast. Contributed into the pane's Actions, so the sources pane knows nothing about it.
  - **`salsanueva`** — SalsaNueva source type in the Events `+` menu: contributes the `salsanueva` type with its dance / style / level / school / teacher / day filters. SalsaNueva event source type: probe reads the school's own courses API (SSRF-guarded) for the published term and groups the dated occurrences back into weekly courses; extract filters them by the source's own dance / level / school selection and publishes each course as ONE recurring event, with no model call.
  - **`source-detail`** — Umbrella for the source side-pane's sections — one sub-plugin per region of a configured source (settings, schedule, status, runs).
  - **`source-field`** — Contributes the `source` dimension into the events DataView: a `sourceId` enum field whose options are the live configured sources, so events can be filtered, sorted and grouped by source with no edit to event-list.
  - **`url-extract`** — Web-page source type in the Events `+` menu: contributes the `url` type with its generic URL + extraction-hint form. Web-page event source type: probe reads the URL through one transport-blind pipeline (SSRF-guarded plain fetch, or a real browser when the source's Fetch mode says so or the site answers a bot challenge), refuses a page it cannot read whole or that has no readable text at all, and fingerprints its normalized visible text; extract turns that text into structured events with a one-shot Sonnet call, validated against ExtractedEventSchema.

<!-- AUTOGENERATED:END -->
