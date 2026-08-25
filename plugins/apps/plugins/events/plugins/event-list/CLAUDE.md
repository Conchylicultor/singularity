# event-list

The Events app's main surface: every event, as a **server-delegated DataView**
(`defineDataView("events.list")`). The set grows without bound and the user
filters/sorts across all of it, so filter/sort/search/pagination compile to SQL —
the `mail/inbox` shape, file for file.

```
core/internal/fields.ts     the shared field-id vocabulary (browser-safe data)
  ↓                              ↓
web/internal/fields.tsx     server/internal/column-map.ts
  (FieldDef[] + value/cell)   (FieldColumnMap: id → drizzle column + type token)
                                 ↓
                            server/internal/handle-query.ts
                              (compileWhere + null-aware keyset seek)
```

One vocabulary, two runtimes: the web `FieldDef[]` and the server
`FieldColumnMap` are both derived from `EVENT_LIST_FIELDS`, so they cannot drift
on which dimensions exist or what type they are.

## Every typed field is a filter AND a sort dimension

That is the whole reason this is a DataView. Adding a dimension means adding a
`FieldDef` + a `COLUMN_MAP` binding — **never** a bespoke toggle chip on the
toolbar, and never a hand-rolled `.map()` of `<Row>` (`no-adhoc-row-list`).

Two ids are deliberately asymmetric between the two sides:

- **`sourceId` is bound server-side with no web field here.** The `source`
  dimension arrives as a *contributed* field extension through the exported
  `EventList.Fields` descriptor — only the `sources` plugin holds the live
  `event_sources` rows its option list is built from. Because the physical
  column is already in `COLUMN_MAP` under the same id, that contributed field
  filters and sorts server-side the moment it lands, with zero edits here. This
  plugin names no source type, ever.
- **`tags` is a web field with no server binding.** There is no
  `fields/tags/plugins/filter-sql` capability, so a binding would resolve no
  operator and every tag rule would be silently dropped. The field is therefore
  display-only (`sortable: false`), and the quick search covers tags through a
  `::text ILIKE` cast instead. When a tags filter-sql capability lands, delete
  the `sortable: false` and add the binding — nothing else changes.

## Disappeared events are hidden by DEFAULT, not by fixed scope

Disappearance is soft (`disappearedAt` stamped, row never deleted), so those
rows must not clutter an ordinary browse — but they must stay reachable, since a
user may have annotated one. `disappearedAt` is therefore a real filterable
field, and `server/internal/scope.ts` applies `IS NULL` only when the caller's
filter tree mentions the field *at all*: naming it, with any operator, is the
view saying "I know about disappearance — here is what I want". Contrast
mail-inbox, whose INBOX predicate is a genuinely fixed scope with no field.

## A disabled source's events are hidden by DEFAULT too

Disabling a source is the user saying "I don't care about this any more", so its
events stop cluttering the list — but nothing is deleted or stamped, so
re-enabling the source brings every one of them straight back. That
reversibility is exactly why this is a query-time scope and not a write.

It follows the disappearance rule above, file for file: `scope.ts` exposes
`shouldHideInactiveSources`, and `handle-query.ts` restricts to events whose
source row is `enabled` only when the caller's filter tree does *not* mention
`sourceId` at all. Naming the `source` dimension — with any operator, "source is
X" as much as "source is-not-empty" — is the view saying "I am asking about
sources", and it then gets exactly what it asked for, a disabled source's events
included; a fixed predicate would instead make that history unreachable.

The predicate is a subquery over `event_sources` (a small user-grown table),
stated positively as "the source is active". Not a denormalized `enabled` copy on
the event row: that duplicates a *mutable* FK attribute across an unbounded
table, and every flip of the toggle would owe a backfill.

Freshness when the toggle flips is not this plugin's problem: `events-core`'s
`events.revision` tick folds in the active-source set, so the open list refetches
in place like any other event change.

## The gallery cover is an accessor, not a field

The poster comes from `viewOptions.gallery.cover` in `web/panes.tsx`, not from
`coverField` — which resolves only `FieldDef` ids, and `imageUrl` is deliberately
not a field (above). Don't mint one for the gallery: that adds a dead sort/filter
axis to every view to serve one view's chrome.

The src passes `externalUrl()` (absolute `http(s)` only — rows come from
untrusted scraped pages). The browser then loads it **directly from the event's
host**, unlike mail's `remote-images` proxy: an email image is an attacker-chosen
per-recipient tracking pixel, an event poster is a public asset on a site the
user configured. A same-origin proxy here would belong in a generic primitive,
not a copy of mail's app-scoped route.

## A row opens the event's page, else its source's

`onRowActivate` (host-level, so list/table/gallery agree) resolves
`event.url ?? source origin URL` through `externalUrl()`. The fallback is the
common case — an extraction often yields no per-event link — and it comes from
`events-core`'s `useSourceOriginUrl()`, whose answer each source type supplies
via its `originUrl`. This plugin still names no source type. No destination
(hand-entered event) → the click is a no-op.

## Config is the only source of view instances

There is no code-synthesized default: the instances come only from
`config/apps/events/event-list/events.list.jsonc`, and
`config:overrides-authored` fails until its `// @review` marker is deleted. The
intended set is `Upcoming` (filter `startsAt is-on-or-after` today, sort
ascending), `All`, and `By category` (grouped).

Freshness is push-based: events-core's `events.revision` tick (count +
max(updated_at)) drives an **in-place** refetch of the loaded pages — it is never
part of the query key.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: The events DataView: a server-delegated keyset query over the events table rendered as list / table / gallery, with every typed field a filter and sort dimension and the saved views authored in config. Reachable from the Events sidebar. Events DataView server: the keyset events query (POST /api/events/query) over the events table — filter/sort/search compiled to SQL, cursor-paginated, with soft-deleted events hidden by default.
- Web:
  - Slots:
    - `EventList.Fields` ← `apps.events.sources.source-field`
    - `eventListPane.Actions` ← `primitives.pane`
  - Contributes:
    - `Pane.Register` "event-list"
    - `Events.Sidebar` "Events" → `component`
  - Uses:
    - `apps/events/events-core.useEventsRevision`
    - `apps/events/events-core.useSourceOriginUrl`
    - `apps/events/shell.Events`
    - `infra/endpoints.fetchEndpoint`
    - `primitives/app-shell.sidebarNavItem`
    - `primitives/css/badge.Badge`
    - `primitives/css/fill.Fill`
    - `primitives/css/line.Line`
    - `primitives/css/placeholder.Placeholder`
    - `primitives/css/spacing.Stack`
    - `primitives/css/text.Text`
    - `primitives/data-view.DataView`
    - `primitives/data-view.defineDataView`
    - `primitives/data-view.defineFieldExtensions`
    - `primitives/live-state.matchResource`
    - `primitives/pane.openPane`
    - `primitives/pane.Pane`
    - `primitives/pane.PaneChrome`
    - `primitives/relative-time.RelativeTime`
  - Exports (values):
    - `EventList`
    - `eventListPane`
    - `EventRow`
    - `useEventUrl`
    - `useOpenEvent`
- Server:
  - Uses:
    - `apps/events/events-core._eventSources`
    - `apps/events/events-core.eventsTable`
    - `database.db`
    - `fields/server-capabilities-loader`
    - `fields/server-capabilities.resolveFieldFilterSql`
    - `infra/endpoints.HttpError`
    - `infra/endpoints.implement`
    - `primitives/data-view/server-query.compileWhere`
    - `primitives/data-view/server-query.OperatorSqlResolver`
    - `primitives/keyset.buildSortKeys`
    - `primitives/keyset.keyValuesOf`
    - `primitives/keyset.orderByClauses`
    - `primitives/keyset.seekPredicate`
  - Exports (values): `handleQuery`
  - Routes: `POST /api/events/query`
- Core:
  - Uses:
    - `apps/events/events-core.EVENT_CATEGORIES`
    - `apps/events/events-core.EventSchema`
    - `infra/endpoints.defineEndpoint`
    - `primitives/data-view.FilterGroupSchema`
  - Exports (types):
    - `EventFieldSpec`
    - `EventFieldType`
    - `QueryEventsBody`
  - Exports (values):
    - `EVENT_CATEGORY_OPTIONS`
    - `EVENT_LIST_FIELDS`
    - `queryEvents`
    - `QueryEventsBodySchema`
    - `QueryEventsResponseSchema`
    - `SortRuleSchema`
- Cross-plugin:
  - Imported by:
    - `apps/events/sources/source-detail/runs/extracted-events`
    - `apps/events/sources/source-field`

<!-- AUTOGENERATED:END -->
