# runs-arm (backup)

The backup arm of the unified run space: `backup_runs` bound into the
[`runs`](../../../runs/CLAUDE.md) union, its own columns, and the two sections of
the backup run-detail pane. It lives under `backup` because `backup_runs` is
backup's table; `runs` names no kind.

## Backup is why the shared vocabulary has `partial`

Every other run either did the thing or did not. A backup builds one archive and
dispatches it to N targets, so it can reach two of three. `BACKUP_STATUS_OUTCOME`
maps `partial` straight through.

That map is also how the outcome `CASE` is built. The union validates each row's
outcome against the closed vocabulary, so a hand-written `CASE` missing a native
status yields `NULL` and throws the whole page; folding the branches out of a
`Record<BackupRunStatus, RunOutcome>` makes an unmapped status a `tsc` error.

## The two base columns that read `null`

- **`namespace`** — a backup is host-global; it archives `~/.singularity`, not a
  checkout. Naming the worktree whose backend ran the job would be a fact about
  scheduling dressed as a fact about the backup.
- **`message`** — a backup has no per-run failure string, only a per-target one,
  and the interesting case is where those disagree. The Targets section shows
  each target's own words instead.

## Deliberately **unscoped**

The build and release arms carry an always-on `where namespace = currentWorktreeName()`,
because a worktree DB is forked from main and inherits main's rows. This arm must
not, and the symmetry is a trap: `backup_runs` has no namespace at all — a backup
covers the machine — so the predicate would not narrow the arm, it would delete
every backup from the view. `null = 'att-…'` is `NULL`, not `false`, and the
symptom is an empty section reading as "no backups yet".

So the merged view is half-scoped: builds and releases are this-worktree-only,
backups and deploys are everything on the machine. That is the intended shape.

## `BACKUP_RUN_KIND` lives in `backup/core`, not here

The kind string is needed on both sides of an import edge that runs one way:
`backup/web` names a selected row with it (`{ kind, id }`) and owns the run-detail
pane, and this arm needs that pane to open a row into it. With the constant in
this plugin's own `core/`, those two edges close a cycle —
`backup → backup/runs-arm → backup` — and `plugin-boundaries` rejects it.

The reasoning that it is safe because the edges are keyed `zone.runtime` and the
two runtimes differ is **wrong**: the cycle rule collapses to plugin granularity,
with no parent/descendant exception. The build arm learned this by checking the
argument instead of running the check; the check reports it in one line.

The parent's own `core/` breaks it because `backup/web → backup/core` is
intra-plugin and there is no path back. **Do not re-export it from this plugin's
core to shorten an import** — cross-plugin re-exports are banned transitively, and
it would put the edge straight back.

## The disclosure was a missing pane, and the pane is the fix

This arm used to contribute a `Runs.Row`: an expand/collapse card carrying the
per-source reports and the per-target outcomes. It contributed no
`Runs.Kind.open` on purpose, because `Row` infers a `<button>` from an `onClick`
and a custom row lands *inside* it — so a non-activating row was the only way the
disclosure trigger and the **Grant access** button could be real buttons rather
than buttons nested inside one.

That was a workaround for a surface that did not exist. A run-detail pane
(`backup/web/panes.tsx`, `/debug/backup/br/:runId`) is what the card actually
wanted to be, and once it exists everything the workaround bought comes for free:
the controls sit in ordinary pane content, the row goes back to being a
single-line field row that obeys the Properties panel, and the row activates like
every other kind's.

The two sections are contributed to `BackupRunDetail.Section`, and both are keyed
by the **run** rather than by its id — the pane resolves the row once through
`useRun`, so no section can render an empty-looking body while the read is still
in flight. `useAvailable` is how a section with nothing to show disappears: the
host paints the card before the body, so a `return null` would leave a titled bar
over emptiness. Targets additionally declares `useDefaultOpen` on a failed
target.

**Grant access is the only in-app repair path** for a storage target whose OAuth
token expired: without it, a Google Drive backup that lost access reports the
failure forever and offers nothing to do about it. Its `providerId` / `scopes`
come off the target's own `consent` payload, because the grant must be for the
scopes that were actually refused. Do not move it into `itemActions` on the row —
a hover-revealed icon cluster is not where someone whose backup just broke will
look.

## Two smaller rules

- Both `sources` expressions test `jsonb_typeof` first: v1 manifests stored
  `sources` as an object, not an array, and `jsonb_array_length` over one errors
  the whole page. They read `null` ("unknown") for a shape they cannot count.
  The non-skipped filter lives in `web/internal/payload.ts`, applying the same
  reading as the `WHERE` inside the count expression, so the section and the
  number cannot disagree.
- `backup.targetResults` / `backup.sources` are declared columns with **no**
  `FieldDef` — a jsonb blob has no comparable projection, so there is nothing to
  sort or filter by. Every field must be a column; not every column need be a
  field. They are read through `armJson`, the `json` member of the `armText` /
  `armNumber` family, so a wrong id or a column not declared `json` does not
  compile. Their schemas are second spellings of ones in `backup/shared`
  (plugin-private, unreachable across the boundary), pinned by
  `ZodParser<BackupTargetResult>` / `ZodParser<BackupSourceReport>` against
  `backup/core` so a drift stops compiling.

## The blobs ride every listed row, and cannot be trimmed off it

Only the detail pane reads these two columns, so shipping them on every row of
every page looks like an obvious payload win to reclaim. It is not available:
the list and the by-id read share **one** projection. `handle-get` passes
`extra: armFieldSpecs(kinds)` — every arm's `defineRunArmFields` declaration —
and its arm comes from the same `defineRunKind` `extra` map the list compiles, so
dropping a column from either declaration drops it from BOTH reads and leaves the
Sources and Targets sections with nothing to decode.

That sharing is deliberate: it is what makes a by-id row byte-identical in shape
to a listed one, so a pane and a list row decode the same columns with the same
accessors and there is no second row type to keep in sync. Trimming the list's
payload would need per-read column selection in `union-query`, which does not
exist today — a real follow-up, and a bigger change than it looks.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: The backup arm's presence on the merged run surface: the kind's label, its rows' activation into the backup run-detail pane, its four scalar columns (native status, archive size, source and target counts) as real filterable and sortable SQL dimensions, and the two detail sections carrying what no scalar column can — the manifest's source reports, and the per-target outcome with its Grant access remediation. The backup arm of the unified run space: binds backup_runs into the runs union — its native status folded into the shared outcome vocabulary (partial included, since backup is the only kind that can half-succeed), a label naming what the run covered, and the source / target counts plus the raw per-target results as its own columns. Reads null for namespace (a backup is host-global) and for message (a backup's failure words are per-target).
- Web:
  - Contributes:
    - `Runs.Kind`
    - `Runs.Fields` "backup" → `BackupRunFields`
    - `BackupRunDetail.Section` "Sources" → `BackupSourcesSection`
    - `BackupRunDetail.Section` "Targets" → `BackupTargetsSection`
  - Uses:
    - `auth.GrantAccessButton`
    - `backup.BackupRunDetail`
    - `backup.backupRunPane`
    - `primitives/css/badge.Badge`
    - `primitives/css/inline.Inline`
    - `primitives/css/rigid.rigidClass`
    - `primitives/css/spacing.Stack`
    - `primitives/css/text.Text`
    - `primitives/css/ui-kit.cn`
    - `runs.armJson`
    - `runs.armNumber`
    - `runs.armText`
    - `runs.runArmFields`
    - `runs.Runs`
- Server:
  - Uses:
    - `backup._backupRuns`
    - `runs.defineRunKind`
  - Register: `defineRunKind('backup')`
- Core:
  - Uses:
    - `backup.BACKUP_RUN_KIND`
    - `runs.defineRunArmFields`
  - Exports (types): `BackupRunStatus`
  - Exports (values):
    - `BACKUP_RUN_STATUSES`
    - `BACKUP_STATUS_OUTCOME`
    - `backupRunFields`

<!-- AUTOGENERATED:END -->
