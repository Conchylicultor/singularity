import { rm } from "node:fs/promises";
import { join } from "node:path";
import { getConfig } from "@plugins/config_v2/server";
import {
  listDatabases,
  backupDatabase,
  backupExclusions,
  inspectBackup,
} from "@plugins/database/plugins/admin/server";
import type { TableStat } from "@plugins/database/plugins/admin/server";
import type {
  BackupSourceItem,
  BackupSourceReport,
} from "@plugins/backup/core";
import { databasesSourceConfig } from "../../shared/config";

/** One database that could not be dumped, and what it said. */
interface FailedDump {
  db: string;
  error: string;
}

export async function assembleDatabases(
  dir: string,
): Promise<BackupSourceReport> {
  const { enabled } = getConfig(databasesSourceConfig);

  if (!enabled) {
    return {
      id: "databases",
      name: "Databases",
      outcome: "skipped",
      items: [],
      sizeBytes: 0,
    };
  }

  // Read once, before any dump: it throws in a process that never collected
  // contributions, which must fail the source rather than dump everything.
  const exclusions = backupExclusions();
  const allDbs = await listDatabases();
  const targetDbs = allDbs.filter(
    (name) => !name.startsWith("claude-") && !name.startsWith("att-"),
  );

  // Dump every target DB concurrently — each pg_dump is an independent
  // subprocess writing its own file, so there is no cross-DB ordering.
  //
  // `allSettled`, not `all`: ONE database must not cost the archive the other
  // six, and it used to. The cluster holds databases this repo's schema does
  // not describe — a composition fork that has not booted since the last
  // migration, a leaked test database — and the exclusion planner rightly
  // refuses to dump one whose kept rows link into rows it would leave out.
  // With `all` that refusal rejected the source, the source rejected the
  // archive, and the run ended having backed up NOTHING: no attachments, no
  // secrets, no transcripts. Three nights ran that way before anyone looked.
  //
  // So a database that cannot be dumped is now recorded and stepped over. The
  // source reports `failed`, which keeps the run off `ok` and puts the reason
  // on its card — it is degraded, loudly, instead of absent, silently.
  const settled = await Promise.allSettled(
    targetDbs.map(async (db) => {
      const out = join(dir, `${db}.dump`);
      try {
        const plan = await backupDatabase(db, out, exclusions);
        const info = await inspectBackup(out, db, plan.excludedTables);
        return {
          item: {
            label: db,
            detail: describeDump(info.tables),
            count: info.tables.length,
          },
          sizeBytes: info.sizeBytes,
        };
      } catch (err) {
        // A `pg_dump` that died part way leaves a truncated `.dump` behind, and
        // a truncated custom-format dump is the worst possible artifact: it is
        // in the archive, it is named after the database, and `pg_restore` only
        // discovers it is short when someone is restoring it. Reclaim it here
        // so the archive holds either a whole dump or no file at all.
        await rm(out, { force: true });
        throw err;
      }
    }),
  );

  const items: BackupSourceItem[] = [];
  const failures: FailedDump[] = [];
  let sizeBytes = 0;
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") {
      items.push(result.value.item);
      sizeBytes += result.value.sizeBytes;
      return;
    }
    const err: unknown = result.reason;
    failures.push({
      db: targetDbs[i] ?? "(unknown)",
      error: err instanceof Error ? err.message : String(err),
    });
  });

  if (failures.length > 0) {
    return {
      id: "databases",
      name: "Databases",
      outcome: "failed",
      error: describeFailures(failures, targetDbs.length),
      items,
      sizeBytes,
    };
  }

  return {
    id: "databases",
    name: "Databases",
    outcome: "included",
    items,
    sizeBytes,
  };
}

/** e.g. "1 of 7 databases could not be dumped:\n  - sonata: …". */
function describeFailures(
  failures: readonly FailedDump[],
  attempted: number,
): string {
  const noun = failures.length === 1 ? "database" : "databases";
  const lines = failures.map((f) => `  - ${f.db}: ${f.error}`);
  return (
    `${failures.length} of ${attempted} ${noun} could not be dumped and ` +
    `${failures.length === 1 ? "is" : "are"} NOT in this archive:\n` +
    lines.join("\n")
  );
}

// e.g. "135 tables / 71934 rows (rows of 1 table left out: traces)". The row
// total counts only rows the archive holds; a left-out table is still counted
// as a table, because its DDL is in the archive.
function describeDump(tables: readonly TableStat[]): string {
  const rows = tables.reduce(
    (acc, t) => (t.rowsExcluded ? acc : acc + t.rowCount),
    0,
  );
  const base = `${tables.length} tables / ${rows} rows`;
  const excluded = tables.filter((t) => t.rowsExcluded).map((t) => t.name);
  if (excluded.length === 0) return base;
  const noun = excluded.length === 1 ? "table" : "tables";
  return `${base} (rows of ${excluded.length} ${noun} left out: ${excluded.join(", ")})`;
}
