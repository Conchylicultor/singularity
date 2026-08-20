import { getTableName } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";

// A plugin opts ITS OWN table's ROWS out of the worktree DB fork by adding
// `ExcludeFromFork({ table, reason })` to its server `contributions`. The fork's
// `pg_dump` gets a `--exclude-table-data` for it, so the table is created in the
// forked DB with its full DDL but no rows.
//
// WHEN TO USE THIS — and the trade you are making. A worktree DB is forked from
// main so an agent starts with the tasks, conversations and pages it needs to do
// its job. Excluding a table says "a fresh worktree has no use for main's rows
// here, and will never re-populate them." That is the correct trade for two
// kinds of table:
//
//   - **Host-local observability.** Traces, slow-op aggregates, crash reports,
//     model-call logs, notifications. These record what happened on the machine
//     that produced them; an inherited row is at best noise in the fork's own
//     debug pane and at worst a phantom (main's undismissed notifications
//     appearing in a fresh worktree's bell). They are also, by volume, almost
//     the entire fork — `traces` alone was 722 MB of a ~970 MB fork.
//   - **Derived state rebuilt on boot.** The live-state snapshot + changelog are
//     a cold-boot accelerator; `boot-init.ts` degrades to a full recompute when
//     they are absent.
//
// It is the WRONG trade for anything a human authored or an agent must read.
// `reason` is required so the decision is a reviewed, documented one rather than
// a silent data-loss footgun — the exclusion is invisible until someone wonders
// why a table in their fork is empty.
//
// EXCLUDE DERIVED STATE TOGETHER WITH ITS SOURCES. A persisted live-state value
// is computed FROM other tables; keeping the snapshot while emptying a table it
// read makes the fork serve a value that disagrees with the rows behind it. That
// is why `live_state_snapshot` and `live_state_changelog` are excluded alongside
// the observability tables rather than kept as an optimisation.
//
// This token lives in `database/admin` rather than beside the fork JOB in
// `database/fork` because `database/fork` imports `shell/notifications` (to
// report a failed fork) and `shell/notifications` is itself a declaring plugin —
// hosting the token there would close a cycle. `admin` reaches only two leaf
// plugins, so no declaring plugin can ever cycle back into it.
//
// Collected by the framework at boot before any `onReadyBlocking` runs (same as
// the `View` and `ExcludeFromChangeFeed` contributions), so the fork job sees
// every exclusion regardless of module import order.
export const ExcludeFromFork = defineServerContribution<{
  table: PgTable | string;
  reason: string;
}>("fork-data-exclusion", { docLabel: (c) => tableLabel(c.table) });

// Schemas a plugin's runtime creates for ITSELF rather than declaring as drizzle
// tables — a job queue's bookkeeping, a sync engine's replication state.
// Inheriting those is not merely wasteful, it is wrong: they describe the
// producing database, and the consuming service recreates them on first use.
//
// `drop` picks which of two very different things happens, and choosing wrong
// breaks the restore rather than degrading it — so it is required, not defaulted:
//
//   - `"schema"` → `--exclude-schema`. The schema and everything in it. Correct
//     when the service must recreate the schema from scratch (Graphile re-runs
//     its own migrations, which would collide with inherited empty tables).
//     ONLY safe when nothing OUTSIDE the schema references into it. Publications
//     and event triggers are database-level objects that `pg_dump` still emits;
//     each one naming a now-missing schema is a `pg_restore` error, and enough of
//     them fail the whole fork. Zero is exactly that case — its
//     `_zero_metadata_0` publication and `zero_ddl_*_0` event triggers live
//     outside its schemas and point back in.
//   - `"data"` → `--exclude-table-data=<schema>.*`. Every table's rows, DDL kept,
//     so nothing outside can dangle. The safer default when in doubt.
//
// `schema` is a `pg_dump` pattern, so `zero*` matches every schema of that
// family. Patterns are matched against the SOURCE database — a pattern matching
// nothing is silently accepted by `pg_dump`, so keep them tight and verify.
export const ExcludeSchemaFromFork = defineServerContribution<{
  schema: string;
  reason: string;
  drop: "schema" | "data";
}>("fork-schema-exclusion", { docLabel: (c) => c.schema });

// A drizzle table object is preferred over a magic string so a rename is
// refactor-safe and a typo is a tsc error; we derive the pg name here. A string
// is accepted for the tables created imperatively with `CREATE TABLE IF NOT
// EXISTS` rather than by a migration (the live-state snapshot + changelog),
// which have no table object to pass — the same reason `derived-tables`'
// contribution takes a string.
function tableLabel(table: PgTable | string): string {
  return typeof table === "string" ? table : getTableName(table);
}

/** What `forkDatabase` must be told not to copy. */
export interface ForkExclusions {
  /** `pg_dump --exclude-table-data` patterns — table kept, rows dropped. */
  readonly tableData: readonly string[];
  /** `pg_dump --exclude-schema` patterns — schema dropped entirely. */
  readonly schemas: readonly string[];
}

// The declared exclusion set, as `pg_dump` patterns.
//
// THROWS on an empty set. `getContributions()` answers `[]` when
// `collectContributions()` has not run, and that only happens in a process that
// never booted the server (a CLI, a script). Silently returning "exclude
// nothing" there would produce a full ~1 GB fork that looks like it worked —
// exactly the silent-empty-registry footgun the change-feed exclusion warns
// about. The declarations in this repo guarantee a non-empty set in any booted
// backend, so empty means "you are calling this from the wrong kind of process",
// which is worth a loud failure.
export function forkExclusions(): ForkExclusions {
  const tables = ExcludeFromFork.getContributions();
  const schemas = ExcludeSchemaFromFork.getContributions();
  if (tables.length === 0 && schemas.length === 0) {
    throw new Error(
      "forkExclusions(): no fork exclusions are registered. Server contributions " +
        "have not been collected in this process — call this only from a booted " +
        "backend, or run collectContributions() first.",
    );
  }
  return {
    tableData: [
      // Every excluded table lives in `public`; a table elsewhere is covered by
      // its schema's own `ExcludeSchemaFromFork` declaration instead.
      ...tables.map((c) => `public.${tableLabel(c.table)}`),
      // `<schema>.*` is a pg_dump pattern: every table in the matched schemas.
      ...schemas.filter((c) => c.drop === "data").map((c) => `${c.schema}.*`),
    ],
    schemas: schemas.filter((c) => c.drop === "schema").map((c) => c.schema),
  };
}
