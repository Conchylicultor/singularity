# admin

## Fork exclusions — "don't fork my data"

A plugin opts **its own** table/schema out of the worktree DB fork, from its own
`contributions`. `reason` is required — an exclusion is invisible until someone
wonders why a table in their fork is empty.

- `ExcludeFromFork({ table, reason })` — this repo's own tables. Pass the drizzle
  table object (rename-safe, typo is a tsc error); a string only for tables made
  with `CREATE TABLE IF NOT EXISTS` instead of a migration.
- `ExcludeSchemaDataFromFork({ schema, keep, reason })` — schemas a foreign
  runtime creates for itself. `schema` is a glob; `keep` names the tables whose
  rows survive.

Both only ever empty tables. **There is no way to remove a schema**, and that is
the point: publications and event triggers are database-level objects `pg_dump`
emits regardless, so a missing schema dangles them (it broke Zero's restore on
seven statements), and a schema that is deleted needs an owner to put it back —
which has no spelling in a contribution. `graphile_worker` is what that cost: a
freshly-forked database could not accept a transactional enqueue until a backend
had booted against it.

`keep` is what makes deleting unnecessary. Graphile's migration watermark lives
in `graphile_worker.migrations`, inside the schema; keeping that one table hands
a fork a schema graphile already considers installed, while main's pending jobs
and crontab watermarks stay behind. `keep: []` (Zero) is required rather than
optional — "nothing comes across" is the decision being asked for.

**Exclude derived state together with its sources.** Keeping `live_state_snapshot`
while emptying a table it read makes a fork serve a value that disagrees with the
rows behind it — for a boot-critical resource, that is what first paint renders.

## Every `pg_dump` argument is built from the source catalog

`pg_dump` silently accepts a pattern matching nothing, so a stale name or an
over-narrowed glob used to produce a fork that copied data nobody meant it to,
with no error anywhere. `internal/fork-plan.ts` matches the declarations against
the **source database's catalog** and builds each argument out of names that
were in it:

| declaration | emitted |
|---|---|
| `keep: []` | `"zero_0/cdc".*` per matched schema |
| `keep: ["migrations"]` | one quoted `schema.table` per non-kept relation |
| `ExcludeFromFork` | `public."traces"` plus every partition leaf under it |

Three details that each fix a real silent miss:

- **Quoting.** `pg_dump` parses a pattern with psql identifier rules, so an
  unquoted `zero_0.changeLog` case-folds to `changelog` and matches nothing.
- **The wildcard for `keep: []`.** The catalog is read before the fork takes its
  host-wide slot, and main's live zero-cache mints schemas on its own schedule;
  deferring the relation set to dump time closes that window. The schema NAME is
  still catalog-derived, which is what the checks need.
- **Partition expansion.** `--exclude-table-data` does not cascade, and a
  partition's rows are dumped under the LEAF's name — so naming only the parent
  would exclude nothing. Nothing is partitioned yet; `traces` (949 MB) is the
  obvious first candidate and is already declared.

### Refused vs reported — split by who can cause it

`forkDatabase` resolves before creating its temp DB, so a refusal leaks nothing.

**Fatal** (`ForkPlanError` → the fork job re-raises it as `NonRetryableError`, so
it dead-letters after one attempt rather than five). Only an edit to THIS repo
can produce either:

- two declarations matching one schema — two `keep` lists, no honest merge;
- a `keep` entry naming no table — the rows you meant to preserve get emptied,
  which for `migrations` breaks graphile's boot in every fork.

**Reported, never fatal.** Everything the source database can cause on its own,
because the exclusion set comes from the forking checkout while the catalog comes
from *main's* database and those drift by construction:

- **a non-system schema no declaration claims** (and that holds data — a schema
  of functions and types has no rows to copy). This is what catches narrowing
  `zero*` to `zero_*`. Fatal was the first draft and it was wrong: a branch cut
  before a plugin landed, a plugin deleted while its schemas live on in main's
  database, or one stray `CREATE SCHEMA` would each have become "no worktree can
  be created on this host". The fork job raises a bell notification deduped per
  schema; the CLI prints it.
- **a declaration matching nothing** — benign, and legitimate when a branch adds
  a table main has not migrated yet, or zero-cache has never run on main.

`COPIED_SCHEMAS` (currently just `public`) is the explicit list of schemas whose
rows ARE app data. The rules are pure (`planForkExclusions`) and tested in
`internal/fork-plan.test.ts` with no database, because `admin` cannot import
`db-test-fixture` — the fixture imports `admin`.

Two more things that look wrong but are load-bearing:

- The contributions live in `admin`, not next to the fork job in `database/fork`,
  because `database/fork` imports `shell/notifications` — itself a declaring
  plugin — so hosting them there closes a cycle.
- `forkDatabase(source, target, exclusions)` takes the set as a **required
  parameter** instead of reading the registry. `getContributions()` answers `[]`
  in any process that never booted the server, so a registry read here would let
  `./singularity db fork` silently produce a full ~2 GB copy that looks fine.
  `forkExclusions()` throws on empty for the same reason; the CLI reads the set
  from a running backend over `GET /api/db/fork-exclusions`, which is why
  `ForkExclusions` is pure data and the flag-building lives in `fork-plan`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Admin operations for the database plugin — fork, backup, drop, list.
- Server:
  - Uses:
    - `infra/host-admission.defineHostPool`
    - `packages/spawn-priority.backgroundArgv`
  - Exports (types):
    - `BackupInfo`
    - `ForkExclusions`
    - `ForkOutcome`
    - `ForkPlan`
    - `ForkSchemaExclusion`
    - `TableStat`
    - `UndeclaredSchema`
  - Exports (values):
    - `backupDatabase`
    - `closeAdminPool`
    - `connectionString`
    - `countActiveConnections`
    - `databaseExists`
    - `describeUndeclaredSchema`
    - `dropDatabase`
    - `ensureDatabase`
    - `ExcludeFromFork`
    - `ExcludeSchemaDataFromFork`
    - `forkDatabase`
    - `forkExclusions`
    - `ForkPlanError`
    - `forkTempPrefix`
    - `getAdminPool`
    - `inspectBackup`
    - `listDatabases`
    - `openShortLivedClient`
- Cross-plugin:
  - Imported by:
    - `apps/mail/mail-core`
    - `backup/sources/databases`
    - `build/run-ledger`
    - `build/serve-composition`
    - `database/change-feed`
    - `database/db-test-fixture`
    - `database/db-test-fixture/worktree-db`
    - `database/fork`
    - `database/live-state-snapshot`
    - `database/query`
    - `database/zero/cache-service`
    - `debug/boot-profile`
    - `debug/profiling/ops`
    - `debug/slow-ops`
    - `debug/slow-ops/cluster`
    - `debug/timeline`
    - `debug/trace/engine`
    - `debug/worktree-cleanup`
    - `infra/claude-cli`
    - `infra/events-test`
    - `infra/jobs`
    - `infra/launcher`
    - `infra/worktree/reclaim`
    - `reports`
    - `shell/notifications`

<!-- AUTOGENERATED:END -->
