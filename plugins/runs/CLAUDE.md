# runs

One list of every long-running operation on this machine — builds, backups,
releases, deploys — federated at read time from each domain's **own** ledger.

Design: [`research/2026-08-28-global-unified-runs-dataview.md`](../../research/2026-08-28-global-unified-runs-dataview.md).

## Read-time federation, not a shared table

The tempting alternative is one `runs` table with a `kind` discriminator, the way
`reports` / `trash` do it. That is right when the primitive *mints* the records.
It is wrong here: these ledgers already exist and carry domain constraints their
owners enforce (`build_runs` has a partial unique index for one in-flight build
per namespace, and is written by the CLI with a hand-written INSERT). A shared
table means dual-write or a derived projection — and a derived ledger's emptiness
is not evidence. Each table stays the single source of truth for its own domain;
`union-query` merges them per request.

## Vocabulary

An **arm** is one run kind's contribution (its table, columns, fields,
renderers). Never call it a *source* — in data-view a source is a
`MergedDataView` presentation, one active at a time, which is a different thing.

A **base column** is one every arm projects (`RUN_BASE_COLUMNS`); an **arm
field** is one only that kind has, always namespaced `<kind>.<id>`. The prefix is
load-bearing: `release_runs` has a `kind` column of its own, which becomes
`release.kind` and must not shadow the discriminator.

## A row is fields, and only fields

Every row is one field-driven line, in every view, for every kind — so the
Properties panel means something. An arm contributes **columns** (`Runs.Fields`)
and a **leading glyph** (`Runs.Leading`); it does not contribute a row body.

There used to be a `Runs.Row`. Do not reintroduce one: the list installs a
`renderRow` override the moment *any* arm contributes, and that override replaces
the field-driven body for **every** kind — so one arm's bespoke row switched off
the visible-fields panel for all four. What the two arms using it actually wanted
was not a row: backup wanted a detail surface it did not have yet, and deploy was
hand-rendering chips its own fields already described.

A domain's detail belongs in the pane `Kind.open` pushes. A domain's data belongs
in `Fields`, where it is filterable and sortable rather than merely visible.

## Where an arm cannot go wrong

Both maps in `defineRunKind` are typed, and that is the point of the plugin:

- `base` is derived from `RUN_BASE_COLUMNS`, so a missing column is a `tsc`
  error, and `namespace: null` is spellable while `startedAt: null` is not.
- `extra` is keyed against the arm's own `defineRunArmFields` declaration, and
  `runArmFields` binds the web `FieldDef.id`s to that same declaration. A field
  id that does not match a server column key does not *fail* — it silently
  degrades to client-side-only filtering over the loaded window. Here it will not
  compile.
- `duration` is derived from `startedAt` / `finishedAt` and is absent from what
  an arm declares, so two arms cannot disagree about what a duration is. It
  measures against `now()` while in flight, which makes it one sortable dimension
  rather than a blank.

**What this surface does not have:** user-defined custom columns. `union-query`
does not run the server-side field augmentors (its row key is `(kind, id)`, not
one column), so a custom column someone configured on another DataView will not
appear here — see [`union-query`](../primitives/plugins/data-view/plugins/union-query/CLAUDE.md).

## `runs.revision`

A hash of each arm's newest 50 rows, plus `hasRuns`. It folds over the registry
and spells no `dependsOn` — the loader reads each arm's table through the pool,
and the change feed captures that read set.

**Growth bound: ≤50 rows per registered arm per recompute, independent of ledger
size.** The window is the point. Fingerprinting the whole collection (a
`GROUP BY` over a computed outcome `CASE`, which no index can serve) was
O(collection) on every change to any arm, on tables that grow with every build.
The window catches inserts, in-window deletes and any change to a hashed column
— strictly more than watermarks, which miss a same-instant finish and any update
touching no timestamp. It misses deletes OUTSIDE the window, i.e. retention:
those rows are not on the page, so nothing on screen needs refreshing. The real
cost is a reader scrolled well past 50 seeing a stale tail until the next
in-window change, and old runs are finished, so that tail is stable by nature.

## Adding an arm

Its own `{core,server,web}` under the owning domain plugin — never here; `runs`
names no kind. `core`: `defineRunArmFields`. `server`: `defineRunKind` in
`register: [...]`. `web`: `Runs.Kind` (label, optional `open`), plus
`Runs.Fields` / `Runs.Leading` as wanted.

`Runs.Fields` also declares the arm's **`section`** — the heading its columns are
listed under in the filter picker, the Properties list and the group-by band
("Build", "Deploy", …), beside the "Common" band of base columns every arm
projects. Give it the same words as the kind's label. It is spelled once on the
registration and stamped onto every field the arm returns, so eight columns
cannot end up under two spellings; see data-view's CLAUDE.md ("Field sections").

`Runs.Kind.open` is a plain callback and cannot call hooks, so it can only use
identifiers the ledger row already carries. When a pane wants one the row does
not have, **fix the pane** — do not grow this API a component seam so an arm can
resolve a lookup at render time. Both cases that hit this were pane bugs: the
release pane hung off a composition **uuid** while the ledger stores the **name**
(reparented onto the paramless route it never needed an ancestor for), and the
deployment pane could not be handed its ancestor's `serverId` at all until the
deploy chain was given routes, which chain a pane's params.

The kind's human label is declared **only** on `Runs.Kind` — the filter chip must
offer every registered kind, not the ones on the loaded page, so the label is a
web fact. `defineRunKind` has no `label`; there is nothing to keep in sync.

Read an arm's own column with `armText` / `armNumber` / `armBool` / `armDate` /
`armTags` / `armJson` (`runs/web`), never by hand off the `catchall`. They take
the arm's specs, so a wrong id or a type that disagrees with the column will not
compile; a null is an answer (the column is null on every other kind's rows) and
a wrong shape throws. `armJson` additionally takes the schema, since `runs` knows
a column is jsonb but not what is inside it.

## Reading one run: `useRun({ kind, id })`

The by-id read behind every run-detail pane. It compiles through the SAME
`compileUnionPage` the list does — one arm, every arm's column specs — so the row
comes back **byte-identical in shape to a listed one** and the same accessors
decode it. There is no second row type.

Two consequences worth knowing. The list and the detail share one projection, so
a column cannot be trimmed from the list without also removing it from the
detail — per-read column selection does not exist in `union-query` today. And the
pair is the address: a run id is unique only within its own ledger.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: The merged run surface: <RunsDataView> over the base field schema plus every arm's contributed fields, and the three seams an arm reaches it through (Runs.Kind for the label + row activation, Runs.Leading for the list row's status glyph, Runs.Fields for its own columns). Every row is a single field-driven line that obeys the view's visible fields, and a domain's detail lives in the pane its rows open — an arm contributes columns and a glyph, never a row body. Also exports useRun, the by-(kind, id) read every run-detail surface hydrates from. The run-kind registry and the one query behind the merged run space: defineRunKind binds a domain's own ledger into the union (base columns typed against the base declaration, extra columns typed against the arm's own field declaration), POST /api/runs/query compiles every registered arm into one keyset page, GET /api/runs/:kind/:id compiles the one arm that owns the kind against every arm's column specs so a single row comes back shaped exactly like a listed one, and runs.revision is the scalar tick that refreshes the loaded window. Names no run kind.
- Web:
  - Slots:
    - `Runs.Kind` ← `apps.deploy.deployments.runs-arm`, `backup.runs-arm`, `build.runs-arm`, `release.runs-arm`
    - `Runs.Leading` ← `build.runs-arm`
    - `Runs.Fields` ← `apps.deploy.deployments.runs-arm`, `backup.runs-arm`, `build.runs-arm`, `release.runs-arm`
  - Uses:
    - `infra/endpoints.fetchEndpoint`
    - `infra/endpoints.useEndpoint`
    - `primitives/css/badge.Badge`
    - `primitives/data-view.DataView`
    - `primitives/data-view.DataViewDensity`
    - `primitives/data-view.defineDataView`
    - `primitives/data-view.defineFieldExtensions`
    - `primitives/live-state.matchResource`
    - `primitives/live-state.useResource`
    - `primitives/pane.useOpenPane`
    - `primitives/relative-time.RelativeTime`
    - `primitives/slot-render.defineDispatchSlot`
    - `runs/run-outcome.RUN_OUTCOME_OPTIONS`
    - `runs/run-outcome.RunOutcomeChip`
    - `runs/run-outcome.RunOutcomeDot`
  - Exports (types):
    - `RunKindContribution`
    - `RunRead`
    - `RunRowProps`
    - `RunsDataViewProps`
  - Exports (values):
    - `armBool`
    - `armDate`
    - `armJson`
    - `armNumber`
    - `armTags`
    - `armText`
    - `formatDuration`
    - `runArmFields`
    - `Runs`
    - `RUNS_VIEW`
    - `RunsDataView`
    - `useRun`
- Server:
  - Contributes: `resource.declare` "runs.revision"
  - Uses:
    - `database.db`
    - `fields/server-capabilities.resolveFieldFilterSql`
    - `infra/endpoints.HttpError`
    - `infra/endpoints.implement`
    - `primitives/data-view/union-query.compileUnionPage`
    - `primitives/keyset.keyValuesOf`
  - Exports (types):
    - `RunArmBaseColumns`
    - `RunKind`
    - `RunKindSpec`
  - Exports (values):
    - `defineRunKind`
    - `durationMsExpr`
    - `getRunKinds`
  - Resources: `runs.revision` (push)
  - Routes:
    - `POST /api/runs/query`
    - `GET /api/runs/:kind/:id`
- Core:
  - Uses:
    - `infra/endpoints.defineEndpoint`
    - `primitives/data-view.FilterGroupSchema`
    - `primitives/live-state.resourceDescriptor`
    - `runs/run-outcome.RunOutcomeSchema`
  - Exports (types):
    - `QueryRunsBody`
    - `QueryRunsResponse`
    - `RunArmBaseColumnId`
    - `RunArmFieldSpecs`
    - `RunBaseColumnId`
    - `RunBaseColumnNullable`
    - `RunByIdResponse`
    - `RunColumnSpec`
    - `RunDerivedColumnId`
    - `UnionRun`
  - Exports (values):
    - `defineRunArmFields`
    - `getRun`
    - `queryRuns`
    - `QueryRunsBodySchema`
    - `QueryRunsResponseSchema`
    - `RUN_BASE_COLUMNS`
    - `RUN_SEARCH_COLUMNS`
    - `RunByIdResponseSchema`
    - `runRowKey`
    - `runsRevisionResource`
    - `UnionRunSchema`
- Cross-plugin:
  - Imported by:
    - `apps/deploy/deployments/runs-arm`
    - `backup`
    - `backup/runs-arm`
    - `build`
    - `build/runs-arm`
    - `release/runs-arm`
- Sub-plugins:
  - **`run-outcome`** — The shared run-outcome display: the colour/label metadata, the derived filter options, and the dot / chip / badge every run kind renders its outcome through — so a build row and a backup row cannot disagree about what `failed` looks like.

<!-- AUTOGENERATED:END -->
