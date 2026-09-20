import type { BackupExclusions } from "./backup-exclusion";
import {
  describeKeptLinks,
  planTableExclusions,
  readSchemaCatalog,
  type SchemaCatalog,
} from "./catalog-plan";

// Turning the declared backup exclusions into `pg_dump` flags, by matching them
// against the database being dumped — the same table rule a fork uses
// (./catalog-plan), so a stale or misspelled name is reported instead of
// silently matching nothing inside `pg_dump`.
//
// A backup keeps every schema, so there are no globs, no `keep` lists and no
// unclaimed schemas. The one finding is `unmatched`, and it is routine here —
// every non-worktree database is dumped with the same set, and a composition
// database (`sonata`, `website`) may never have had the table.
//
// The one refusal is shared with the fork: a kept table with a foreign key to a
// table whose rows are left out (see `KeptLinkToLeftOut` in ./catalog-plan).
// Such an archive dumps fine and only fails on the day someone restores it, so
// the backup run fails instead, before `pg_dump` starts.

/**
 * The declared backup exclusions cannot produce a restorable archive of this
 * database. Deterministic — the same declarations against the same schema fail
 * identically — so only an edit to a contribution (or the schema) fixes it.
 * Thrown before `pg_dump` runs, so the backup fails loudly instead of writing
 * an archive whose restore would break.
 */
export class BackupPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupPlanError";
  }
}

/** What `backupDatabase` ran with. */
export interface BackupPlan {
  /** `--exclude-table-data` arguments, each built from a name in the catalog. */
  readonly excludeTableData: readonly string[];
  /** The relations whose rows were left out (declared tables plus partition leaves). */
  readonly excludedTables: readonly string[];
  /** Declarations naming no table in this database, as human-readable lines. */
  readonly unmatched: readonly string[];
}

/**
 * Pure: every input is an argument.
 *
 * THROWS {@link BackupPlanError} when a kept table links to a left-out one.
 */
export function planBackupExclusions(
  catalog: SchemaCatalog,
  exclusions: BackupExclusions,
): BackupPlan {
  const { excludeTableData, excludedTables, unmatched, keptLinks } =
    planTableExclusions(catalog, exclusions.tables);
  if (keptLinks.length > 0) {
    throw new BackupPlanError(describeKeptLinks("backup", keptLinks));
  }
  return { excludeTableData, excludedTables, unmatched };
}

/**
 * {@link readSchemaCatalog} then {@link planBackupExclusions}, with the
 * database's NAME in any refusal.
 *
 * The pure planner cannot say which database it refused — it is handed a
 * catalog, not a name — and for three nights that was the difference between a
 * diagnosable failure and a riddle. Every database in the cluster is planned
 * against the same declarations, so a message naming only the constraint reads
 * as "your declarations are wrong" when the truth is usually "THIS database's
 * schema is older than your declarations": a composition fork that has not
 * booted since the migration that dropped the link, or a leaked test database.
 * Those are not fixed by editing a contribution, which is what the shared
 * wording advises, so the name is the whole difference.
 */
export async function resolveBackupPlan(
  source: string,
  exclusions: BackupExclusions,
): Promise<BackupPlan> {
  try {
    return planBackupExclusions(await readSchemaCatalog(source), exclusions);
  } catch (err) {
    if (err instanceof BackupPlanError) {
      throw new BackupPlanError(`database "${source}": ${err.message}`);
    }
    throw err;
  }
}
