# events-core

The Events app's contract layer. Everything else in the app depends on this and
nothing here depends on them.

## `EventSourceType` — two phases, on purpose

`defineEventSourceType` (server) registers a source *type* into an id-keyed
`Map` (the `defineWallpaperProvider` / `defineTrashSource` idiom) because the
refresh engine dispatches **by id** at run time — a source row names its type.

The `probe` / `extract` split makes the extraction cache **structural**: the
engine holds `lastFingerprint`, so it is literally unable to call the expensive
phase on an unchanged source. A single `run()` would leave "don't pay for the
LLM when nothing changed" as per-provider discipline a future marketplace source
type silently forgets — at real cost, on every tick, invisibly. `payload`
threads the already-fetched bytes from probe into extract, so the split costs no
second fetch. A type that genuinely cannot probe cheaply returns
`fingerprint: null` and always extracts.

`probe`/`extract` **throw**; `NonRetryableError` is terminal and classifies onto
the source row. `extract` returns `{ events, flags }`: `events: []` means the page
genuinely lists no events — never use it to signal a failure, or the engine will
stamp `disappearedAt` on everything it previously found. `flags` is a *report* on
a successful run (what the `date` format could not express), never a soft failure
and never a reason to keep an event whose date is undeterminable.

`ProbeContext` carries `runId` — the run the phase belongs to, minted by the
engine before the first phase. Stamp any durable side effect (a model call, a
fetched artifact) with it so the run's ledger row can find it afterwards. Generic
by construction: it names no LLM.

## Per-type config

A source type declares its user input as a `FieldsRecord` in its own `core/`.
The server validates a row's `config` jsonb against `fieldsToZodObject(...)`;
the web renders the add/configure form generically from the same record via the
`EventSources.Type` slot. **A new source type therefore ships zero form code.**

A type also answers "which page does a configured source of mine stand for?" via
the optional web-slot `originUrl(config)`. `useSourceOriginUrl()` joins it with
the live source rows here — the only plugin holding both halves — so a surface
links an event back to its origin without naming a source type. Omit it for a
type that stands for no page (`manual`).

## Data model

Four `defineEntity` tables, field records in `core/internal/fields.ts`:

- `event_sources` — one row per *configured instance*. Runtime/derived state
  (`status`, `lastFingerprint`, `lastRunAt`/`nextRunAt`, the classified error,
  `last_outcome`/`last_event_count`) lives here, never in `config` — the
  `mail_accounts` + `mail_sync_state` split. `extractionStatus(source)` (`core/`)
  derives never/ok/empty/failed from the last two and is **never stored**: one
  fact, one derivation, nothing to drift. `empty` is its own arm on purpose — a
  successful extraction that found nothing is how a source goes silently broken,
  and folding it into `ok` is what hides it.
- `events` — one row per event *or series*: `date` (jsonb, `event-date`) states
  recurrence once, and `starts_at`/`ends_at`/`all_day`/`recurring`/
  `recurrence_label` are its projections, written only via `eventDateProjection`.
  There is no `series_key`: the row IS the series and its `external_id` is the
  key. `date` is NOT NULL with **no** DB default — there is no honest constant
  for "when", so a write that omits it must fail loudly.
  Unique `(source_id, external_id)`; the engine upserts against it,
  which is why `external_id` is NOT NULL (a nullable column makes the conflict
  target unusable). A source type MAY supply an `externalId`; when it can't, the
  **engine** derives one — deriving it there is what keeps re-extraction
  idempotent by construction. Disappearance is soft (`disappeared_at` stamped,
  never deleted) so a flaky scrape can't destroy annotated rows. Two timestamp
  pairs: `created_at`/`updated_at` are row lifecycle, `first_seen_at`/
  `last_seen_at`/`disappeared_at` are extraction sighting.
- `event_source_runs` — the run ledger, including the cheap `unchanged` runs.
  This is what makes "why did nothing happen" answerable. Insert-only (rows are
  complete by construction), so its `events.runs-revision` tick is
  `count(*) + max(started_at)`; `useEventSourceRuns` refetches off it, which is
  what keeps the ledger and the live source status from disagreeing. Readable one at a time
  (`GET /api/events/runs/:runId` → `requireRun`, 404 on absent) — deliberately
  NOT nested under the source, so a deep-linked run pane resolves from its own id
  instead of whatever window the runs list happens to have loaded.
- `event_source_run_events` — which events one run touched and how
  (`created`/`updated`/`disappeared`), the detail behind the run row's counts.
  Written by the engine INSIDE the ledger's own transaction, so a run and its
  event list cannot half-exist. Deliberately not a `last_run_id` stamp on
  `events`: a stamp is overwritten by the next run, leaving every older run
  showing an empty list under counts that say otherwise. Read as
  `GET /api/events/runs/:runId/events` (the event row + its action, flat).

**All `events` writes go through the repo funnel**, `upsertEvents()` /
`markEventsDisappeared()` in `server/internal/events-repo.ts`. The
`events.revision` tick is `count(*) + max(updated_at)`, so a write that omits
the stamp lands in the DB but never reaches an open DataView. The funnel owns
the stamp, the barrel exports `events` only as the read handle `eventsTable`,
and the plugin's own `events/no-raw-events-write` lint rule fails any
`db.insert/update/delete(eventsTable)` elsewhere. Don't add a second write path.

That tick means "the events QUERY's result may have moved", so it also folds in
an md5 of the **enabled source ids** — the query hides events of a disabled
source, so toggling one changes the result with no `events` write. Ids only,
never `event_sources.updated_at`: a run flips `status` several times, which would
pulse every open list for a change it cannot see. The loader reading
`event_sources` is what puts it in the resource's read-set (that, not
`identityTable`, is what decides which tables recompute it).

Retention (`events` disappeared > 90 d, runs > 30 d) belongs to the `refresh`
plugin, which owns the sweeps.

## Refresh dispatch seam

`refresh` imports `events-core`, so `events-core` cannot import it back. The
"Refresh now" endpoint dispatches through `registerRefreshRunner` — a single
handler the engine installs in its `register` phase. Absent handler is a loud
503, not a swallowed no-op.

"Refresh all" (`POST /api/events/sources/refresh-all`) is that same seam in a
sequential loop over the ENABLED sources, answering a **tally** of the per-source
result arms — a disabled source is no candidate and is counted nowhere, and a
resolved promise is not "all refreshed".

Design: [`research/2026-08-03-apps-events-event-tracking-app.md`](../../../../../research/2026-08-03-apps-events-event-tracking-app.md).

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Contract layer for the Events app, web half: the EventSources.Type source-type slot plus the live sources / events-revision hooks and the source-CRUD mutations. Contract layer for the Events app: the event_sources / events / event_source_runs entities, the defineEventSourceType two-phase registry, source CRUD endpoints, and the live sources window + events revision tick.
- Web:
  - Slots: `EventSources.Type` ← `apps.events.sources.dmda`, `apps.events.sources.manual`, `apps.events.sources.salsanueva`, `apps.events.sources.url-extract`
  - Uses:
    - `infra/endpoints.useEndpoint`
    - `infra/endpoints.useEndpointMutation`
    - `primitives/live-state.ResourceResult`
    - `primitives/live-state.useResource`
    - `primitives/live-state.useWindowResource`
  - Exports (values):
    - `EventSources`
    - `useCreateEventSource`
    - `useDeleteEventSource`
    - `useEventSourceRun`
    - `useEventSourceRuns`
    - `useEventSources`
    - `useEventsRevision`
    - `useRefreshAllEventSources`
    - `useRefreshEventSourceNow`
    - `useRunEvents`
    - `useSourceOriginUrl`
    - `useUpdateEventSource`
- Server:
  - Contributes:
    - `resource.declare` "events.sources"
    - `resource.declare` "events.revision"
    - `resource.declare` "events.runs-revision"
  - Uses:
    - `database.db`
    - `infra/endpoints.HttpError`
    - `infra/endpoints.implement`
    - `infra/entities.defaultNow`
    - `infra/entities.defineEntity`
    - `infra/query-resource.windowQueryResource`
  - DB schema: `plugins/apps/plugins/events/plugins/events-core/server/internal/tables.ts`
  - Exports (types):
    - `EventSourceType`
    - `EventWriteInput`
    - `ProbeContext`
    - `ProbeResult`
    - `RefreshRunner`
    - `TouchedEvent`
    - `UpsertEventsResult`
  - Exports (values):
    - `_eventSourceRunEvents`
    - `_eventSourceRuns`
    - `_eventSources`
    - `createSource`
    - `defineEventSourceType`
    - `deleteSource`
    - `eventRunsRevisionServerResource`
    - `eventSourcesServerResource`
    - `eventsRevisionServerResource`
    - `eventsTable`
    - `getEventSourceType`
    - `listEventSourceTypes`
    - `listRunEvents`
    - `listRuns`
    - `listSources`
    - `markEventsDisappeared`
    - `registerRefreshRunner`
    - `requireRun`
    - `requireSource`
    - `updateSource`
    - `upsertEvents`
  - Resources:
    - `events.revision` (push)
    - `events.runs-revision` (push)
    - `events.sources` (keyed, window)
  - Routes:
    - `GET /api/events/sources`
    - `POST /api/events/sources`
    - `GET /api/events/sources/:id`
    - `PATCH /api/events/sources/:id`
    - `DELETE /api/events/sources/:id`
    - `POST /api/events/sources/:id/refresh`
    - `POST /api/events/sources/refresh-all`
    - `GET /api/events/sources/:id/runs`
    - `GET /api/events/runs/:runId`
    - `GET /api/events/runs/:runId/events`
- Core:
  - Uses:
    - `apps/events/event-date.EventDate`
    - `apps/events/event-date.EventDateSchema`
    - `fields.FieldsRecord`
    - `fields.fieldsToZodObject`
    - `fields.nullable`
    - `fields/bool/config.boolField`
    - `fields/date/config.dateField`
    - `fields/int/config.intField`
    - `fields/json/config.jsonField`
    - `fields/text/config.enumTextField`
    - `fields/text/config.textField`
    - `infra/endpoints.defineEndpoint`
    - `infra/query-resource.windowQueryResourceDescriptor`
    - `primitives/live-state.resourceDescriptor`
  - Exports (types):
    - `CreateEventSourceBody`
    - `EventCategory`
    - `EventRecord`
    - `EventSource`
    - `EventSourceRun`
    - `EventSourceRunEvent`
    - `ExtractedEvent`
    - `ExtractionResult`
    - `ExtractionStatus`
    - `RefreshAllResult`
    - `RefreshCadence`
    - `RefreshSourceResult`
    - `RunEvent`
    - `RunEventAction`
    - `RunOutcome`
    - `SourceStatus`
    - `UpdateEventSourceBody`
  - Exports (values):
    - `createEventSource`
    - `CreateEventSourceBodySchema`
    - `deleteEventSource`
    - `EVENT_CATEGORIES`
    - `eventFields`
    - `eventRunsRevisionResource`
    - `EventSchema`
    - `eventSourceFields`
    - `eventSourceRunEventFields`
    - `EventSourceRunEventSchema`
    - `eventSourceRunFields`
    - `EventSourceRunSchema`
    - `EventSourceSchema`
    - `eventSourcesResource`
    - `eventsRevisionResource`
    - `ExtractedEventSchema`
    - `EXTRACTION_STATUSES`
    - `ExtractionResultSchema`
    - `extractionStatus`
    - `getEventSource`
    - `getEventSourceRun`
    - `listEventSourceRuns`
    - `ListEventSourceRunsQuerySchema`
    - `listEventSources`
    - `listRunEvents`
    - `ListRunEventsQuerySchema`
    - `REFRESH_CADENCES`
    - `refreshAllEventSources`
    - `RefreshAllResultSchema`
    - `refreshEventSourceNow`
    - `RefreshSourceResultSchema`
    - `RUN_EVENT_ACTIONS`
    - `RUN_OUTCOMES`
    - `RunEventSchema`
    - `SOURCE_STATUSES`
    - `updateEventSource`
    - `UpdateEventSourceBodySchema`
- Cross-plugin:
  - Imported by:
    - `apps/events/event-list`
    - `apps/events/refresh`
    - `apps/events/sources`
    - `apps/events/sources/dmda`
    - `apps/events/sources/manual`
    - `apps/events/sources/refresh-all`
    - `apps/events/sources/salsanueva`
    - `apps/events/sources/source-detail/runs`
    - `apps/events/sources/source-detail/runs/caveats`
    - `apps/events/sources/source-detail/runs/extracted-events`
    - `apps/events/sources/source-detail/runs/model-call`
    - `apps/events/sources/source-detail/schedule`
    - `apps/events/sources/source-detail/settings`
    - `apps/events/sources/source-field`
    - `apps/events/sources/url-extract`

<!-- AUTOGENERATED:END -->
