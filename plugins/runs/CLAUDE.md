# runs

One list of every long-running operation on this machine — builds, backups,
releases, deploys — federated at read time from each domain's **own** ledger.

Design: [`research/2026-08-28-global-unified-runs-dataview.md`](../../research/2026-08-28-global-unified-runs-dataview.md);
the routed union window: P6 of
[`research/2026-10-01-global-scoped-change-routing-p5-p8-v2.md`](../../research/2026-10-01-global-scoped-change-routing-p5-p8-v2.md).

## Read-time federation, not a shared table

The tempting alternative is one `runs` table with a `kind` discriminator, the way
`reports` / `trash` do it. That is right when the primitive *mints* the records.
It is wrong here: these ledgers already exist and carry domain constraints their
owners enforce (`build_runs` has a partial unique index for one in-flight build
per namespace, and is written by the CLI with a hand-written INSERT). A shared
table means dual-write or a derived projection — and a derived ledger's emptiness
is not evidence. Each table stays the single source of truth for its own domain;
the `runs` collection is a **union** over them (`liveCollection("runs", { arms:
{ discriminator: "kind" } })`, served by network/live's `serveUnionCollection`).

## The union window

`runs` (core) is a routed, scrollable union window: one arm per registered run
kind, each served from its own table, listed in one order (`startedAt desc`,
then the row key). It mints `runs` (the window), `runs:rows` (a point read by
row key — `useRun`) and `runs:groups` (minted, subscriber-gated: no surface
declares facets over it, D23).

- **The row key** is `kind:id` (`runRowKey`, query-resource's `armKeyCodec`):
  a run id is unique only within its own ledger.
- **Live, routed.** Every arm's routes gate on exactly the columns its SQL
  reads, so a `pid` heartbeat (or a deploy's `leg_run_id`, a backup's
  `namespace`) reaches no window; a write to one ledger refills just the rows it
  changed, in the windows reading that arm. A deploy's label reads its server's
  name through a LOOKUP join, so a server rename relabels exactly that server's
  runs (a `reverse` route; over 500 runs the reading windows recompute FULL).
- **Arm pruning.** A filter that can only match some kinds (`kind is build`, a
  build-only column) compiles no SQL — and reads no routes — for the others.

## Vocabulary

An **arm** is one run kind's contribution (its table, its bindings, its own
columns, its renderers). Never call it a *source* — in data-view a source is a
`MergedDataView` presentation, one active at a time, which is a different thing.

A **base field** is one every arm projects (`RunRowSchema`); an **arm column**
is one only that kind has, declared by the arm's own `liveArmColumns(runs,
kind, …)` in its core. Arm columns ride their rows under `$columns[<kind>]`,
read through the arm's handle (`handle.read(run)` — `null` on another kind's
row), and their wire / field ids are `<kind>.<field>` — `release.kind` never
shadows the discriminator.

## A row is fields, and only fields

Every row is one field-driven line, in every view, for every kind — so the
Properties panel means something. An arm contributes **columns** (`Runs.Fields`)
and a **leading glyph** (`Runs.Leading`); it does not contribute a row body.

There used to be a `Runs.Row`. Do not reintroduce one: the list installs a
`renderRow` override the moment *any* arm contributes, and that override replaces
the field-driven body for **every** kind — so one arm's bespoke row switched off
the visible-fields panel for all four.

A domain's detail belongs in the pane `Kind.open` pushes. A domain's data belongs
in `Fields`, where it is filterable and sortable rather than merely visible.

## Where an arm cannot go wrong (T9)

`defineRunKind({ columns, from, id, joins?, base(j), extra(j), where?(j) })`:

- `columns` is the arm's own `liveArmColumns` set; the kind is ITS arm, so the
  discriminator, the row key's prefix and the field ids cannot drift.
- `base(j)` binds every base field but `id` and `duration` — each a column ref
  `j` offers whose column reads as the field's type (data type and nullability:
  an integer column cannot be a `label`, a text column cannot be `startedAt`),
  or an `ExprField` whose value type is the field's (tsc); a nullable
  field may be `null` ("no such notion": backup and deploy have no namespace).
- `extra(j)` binds exactly the arm column set's fields, each typed the same way (tsc).
- `id` is the ledger's single-column primary key (the row key encodes it), and
  `duration` is derived — `finishedAt − startedAt`, NULL while running — so two
  arms cannot disagree about what a duration is. A running run's elapsed time is
  `<RunDuration>`'s browser ticker, never a value the server re-pushes.
- Labels and outcomes are `ExprField`s whose provenance is read off their SQL: a
  correlated subquery over an undeclared table cannot be written — declare it as
  a join.

**What this surface does not have:** user-defined custom columns. A union's
column vocabulary is its arms' static handles (no `columnScope`).

## Adding an arm

Its own `{core,server,web}` under the owning domain plugin — never here; `runs`
names no kind. `core`: `liveArmColumns(runs, kind, { row, filterable, sortable
})`. `server`: `defineRunKind` in `register: [...]`. `web`: `Runs.Kind` (label,
optional `open`), plus `Runs.Fields` (each field binds `column:
handle.column(field)` and reads `handle.read(run)`) / `Runs.Leading` as wanted.

`Runs.Fields` also declares the arm's **`section`** — the heading its columns are
listed under in the filter picker, the Properties list and the group-by band
("Build", "Deploy", …), beside the "Common" band of base fields. Give it the same
words as the kind's label; see data-view's CLAUDE.md ("Field sections").

`Runs.Kind.open` is a plain callback and cannot call hooks, so it can only use
identifiers the row already carries. When a pane wants one the row does not
have, **fix the pane** — do not grow this API a component seam.

The kind's human label is declared **only** on `Runs.Kind` — the filter chip must
offer every registered kind, not the ones on the loaded page.

## Reading one run: `useRun({ kind, id })`

`useLiveRow(runs, runRowKey(ref))` — a live point read of the union's `:rows`,
the row shaped exactly like a listed one (`$columns` included). A key naming no
registered kind, or no row, is `found: false`, never a contract error. A pane
resolves it with `resolveRow` and renders its body from `rowOrStale` (the found
row, or on a failed re-read the row as last seen).

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: The merged run surface: <RunsDataView> over the `runs` union window (a live scroll: base fields plus every arm's contributed fields, each bound to its column), and the three seams an arm reaches it through (Runs.Kind for the label + row activation, Runs.Leading for the list row's status glyph, Runs.Fields for its own columns). Every row is a single field-driven line; a domain's detail lives in the pane its rows open. Also exports useRun (a live point read of one run by its (kind, id) pair) and <RunDuration> (finished duration, or a running run's ticking elapsed time). The run-kind registry and the merged run space as ONE routed union window: defineRunKind binds a domain's own ledger into the `runs` collection as an arm (base fields typed against the row, its own columns against its liveArmColumns set; id and duration derived), and serveUnionCollection serves the window, its `:rows` point read (useRun) and `:groups` from every registered arm — a write to one ledger refills only the rows it changed. Names no run kind.
- Web:
  - Slots:
    - `Runs.Kind`
    - `Runs.Leading`
    - `Runs.Fields`
  - Slot contributors:
    - `Runs.Kind` ← `apps.deploy.deployments.runs-arm`
    - `Runs.Kind` ← `backup.runs-arm`
    - `Runs.Kind` ← `build.runs-arm`
    - `Runs.Kind` ← `release.runs-arm`
    - `Runs.Leading` ← `build.runs-arm`
    - `Runs.Fields` ← `apps.deploy.deployments.runs-arm`
    - `Runs.Fields` ← `backup.runs-arm`
    - `Runs.Fields` ← `build.runs-arm`
    - `Runs.Fields` ← `release.runs-arm`
  - Uses:
    - `network/live.LiveRowResult`
    - `network/live.useLiveRow`
    - `primitives/css/badge.Badge`
    - `primitives/data-view.DataView`
    - `primitives/data-view.DataViewDensity`
    - `primitives/data-view.defineDataView`
    - `primitives/data-view.defineFieldExtensions`
    - `primitives/data-view.liveDataSource`
    - `primitives/pane.useOpenPane`
    - `primitives/relative-time.RelativeTime`
    - `primitives/relative-time.useNow`
    - `primitives/slot-render.defineDispatchSlot`
    - `runs/run-outcome.RUN_OUTCOME_OPTIONS`
    - `runs/run-outcome.RunOutcomeChip`
    - `runs/run-outcome.RunOutcomeDot`
  - Exports (types):
    - `RunKindContribution`
    - `RunRowProps`
    - `RunsDataViewProps`
  - Exports (values):
    - `formatDuration`
    - `RunDuration`
    - `Runs`
    - `RUNS_VIEW`
    - `RunsDataView`
    - `useRun`
- Server:
  - Contributes:
    - `resource.declare` "runs"
    - `resource.declare` "runs:groups"
    - `resource.declare` "runs:rows"
  - Uses: `network/live.serveUnionCollection`
  - Exports (types):
    - `RunArmBase`
    - `RunArmRefs`
    - `RunFieldBinding`
    - `RunKind`
    - `RunKindSpec`
  - Exports (values):
    - `defineRunKind`
    - `getRunKinds`
  - Resources:
    - `runs` (keyed, window)
    - `runs:groups` (push)
    - `runs:rows` (keyed, point)
- Core:
  - Uses:
    - `infra/query-resource.armKeyCodec`
    - `network/live.liveCollection`
    - `network/live.WithContributedColumns`
    - `network/live/filter.liveInstant`
    - `network/live/filter.liveNumber`
    - `network/live/filter.liveText`
    - `runs/run-outcome.RUN_OUTCOMES`
    - `runs/run-outcome.RunOutcomeSchema`
  - Exports (types): `RunRow`
  - Exports (values):
    - `runRowKey`
    - `RunRowSchema`
    - `runs`
- Cross-plugin:
  - Imported by:
    - `apps/deploy/deployments/runs-arm`
    - `backup`
    - `backup/runs-arm`
    - `build`
    - `build/runs-arm`
    - `release/runs-arm`
- Sub-plugins:
  - **`run-outcome`** — The shared run-outcome display: the colour/label metadata, the derived filter options, and the dot / chip / badge every run kind renders its outcome through — so a build row and a backup row cannot…

<!-- AUTOGENERATED:END -->
