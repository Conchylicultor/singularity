# derived-tables

A **trigger-maintained materialized rollup** ("hand-rolled IVM") is the home for
an aggregate that is too expensive to recompute from scratch on every live-state
poll, yet **not expressible as a plain derived view** (e.g. a TS-shaped
multi-query join, or a "latest row per group" rollup). It is the L3/IVM rung of
the live-state engine, built without the unavailable `pg_ivm` extension.

Like a plain derived view, a rollup is **derived state, not stateful schema**:
fully recomputable from its source tables, created imperatively on boot (NOT a
drizzle migration), and kept current by STATEMENT-level triggers on the source.

## Why a thin registry

The feed-exemption (below) needs a registration surface, and the DB-infra
change-feed must NOT import a feature-specific table name (wrong dependency
direction). So this is a deliberately **thin** collection-consumer registry:
the contributor (`conversations/agents`) _contributes_ an opaque-SQL
`DerivedRollupSpec`; the change-feed _consumes_ the collection generically. One
contributor today; a second rollup registers with **zero** edits to
change-feed / derived-views / read-set. Generalizing the _shape_ of a rollup
waits for a 2nd case — measure first.

## How it works

- A plugin declares a `DerivedRollupSpec` (`{ table, createDdl, functionDdl,
triggerDdl, reconcileDdl }` — opaque SQL strings) and adds
  `DerivedTable(spec)` to its server `contributions: [...]`. The concrete SQL
  lives in the owning plugin (e.g. `agents/server/internal/rollup-spec.ts`),
  never here — the generic layer only orchestrates the four DDL phases.
- The rollup table's drizzle read handle lives in a **non-glob file**
  (e.g. `rollup-table.ts`, NOT `tables.ts`/`schema.ts`) so codegen never emits a
  migration for it — same reason plain views live in `views.ts`.
- `rebuildDerivedTables(db)` (server) runs in the **`database` plugin's own
  `onReadyBlocking`** (`plugins/database/server/index.ts`), sequenced explicitly
  after `runMigrations` and before `rebuildDerivedViews` — the rollup-before-view
  order matters because a derived view may reference a rollup table (e.g.
  `attempts_v` LEFT JOINs the rollups), so the rollup must exist when `CREATE
VIEW` runs. It takes its executor as a parameter so it never imports
  `@plugins/database/server` (which would cycle); `database/server` passes the
  pool-backed `db`. Feed-exemption is not a matter of _when_ it runs: the rollup
  tables are named in `feedExemptTables()`, which the change-feed unions into its
  denylist, so `listPublicTables` filters them out and no NOTIFY trigger is ever
  installed on them regardless of creation order.
- `feedExemptTables()` returns the rollup table names; the change-feed merges
  them into its trigger `DENYLIST` so a rollup is never fed (it is a pure
  read-cache fed by its source's change, not an independent write surface).

### The two halves: definition is skippable, repair is not

`rebuildDerivedTables` treats a spec as two halves with different natures, and
the distinction is load-bearing:

- **Definition** — `createDdl` + `functionDdl` + `triggerDdl`. The output IS the
  definition text, so a content signature (kept in `derived_table_state`, the
  twin of `derived_view_state` and `live_state_trigger_state`) licenses skipping
  it when nothing changed. This matters because `triggerDdl` is a `DROP TRIGGER`
  \+ `CREATE TRIGGER` on the **source** table, holding an AccessExclusive lock on
  `conversations` / `pushes` until commit — the same lock window
  `rebuildDerivedViews` documents for its own DROP+CREATE, and the reason it
  skips too. It bites hardest during a hot-swap (the previous backend is still
  reading those tables) and for server-core's short-lived `exec` boot mode, which
  runs `onReadyBlocking` while a backend is up and busy.
- **Repair** — `reconcileDdl`. Its output depends on source **data**, so it runs
  **unconditionally, every boot**. Do not put it behind the signature later.

**Why the reconcile must stay unconditional.** A rollup holds rows and can drift
from its source with its definition byte-identical:

- `TRUNCATE` on a source fires **none** of the three `AFTER INSERT/UPDATE/DELETE`
  statement triggers — no `AFTER TRUNCATE` trigger is declared — leaving every
  rollup row stale and signalling nothing.
- Each spec's "COMPLETENESS — why source-table-only triggers suffice" argument
  rests on application-level invariants (an immutable `attempt_id`, a patch shape
  with no reparenting field), and each spec then says the boot reconcile is the
  safety net **regardless of that assumption**. Gating the reconcile would promote
  reasoning the authors declined to rely on into load-bearing, and a TypeScript
  change could violate it without moving a byte of rollup SQL.
- The reconcile is the documented self-heal for drift from downtime and bulk
  loads.

A definition signature observes none of that. The reconcile is a scan
(`INSERT … SELECT` + `DELETE` against the rollup), not a lock on a hot source
table, so leaving it unconditional costs startup time and blocks nothing.

## Boundaries

- `core/` — the `DerivedRollupSpec` type (opaque SQL strings). Pure, no DB
  import.
- `server/` — the `DerivedTable` server contribution (the registration surface
  consumers import), `rebuildDerivedTables(db)`, and `feedExemptTables()`.
  `rebuildDerivedTables` takes `db` as a parameter so it never imports
  `@plugins/database/server`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Rebuilds trigger-maintained materialized rollup tables from source on every boot. A rollup is derived state (declared via the DerivedTable contribution), kept current incrementally by STATEMENT triggers — a hand-rolled IVM for aggregates too expensive to recompute live yet not expressible as a plain view.
- Server:
  - Uses: `primitives/log-channels.defineLogSink`
  - Exports (values):
    - `DerivedTable`
    - `feedExemptTables`
    - `rebuildDerivedTables`
- Cross-plugin:
  - Imported by:
    - `conversations/agents`
    - `database`
    - `database/change-feed`
    - `tasks/tasks-core`
- Core:
  - Exports (types): `DerivedRollupSpec`

<!-- AUTOGENERATED:END -->
