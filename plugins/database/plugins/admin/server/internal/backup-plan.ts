import type { BackupExclusions } from "./backup-exclusion";
import {
  APP_SCHEMA,
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
// every backed-up database is dumped with the same set, and a composition
// database (`sonata`) may never have had the table.
//
// A kept table with a foreign key to a table whose rows are left out (see
// `KeptLinkToLeftOut` in ./catalog-plan) would make the archive fail on the day
// someone restores it. What happens then depends on WHOSE schema this is:
//
// - `strict` — the database of the running namespace, whose migrations ran at
//   boot, so its schema IS the one this checkout declares. A link here is a bad
//   declaration: refuse (`BackupPlanError`), exactly like the fork.
// - lenient — any other database on the cluster. Its schema is whatever version
//   of the code last migrated it: a composition that has not booted since the
//   migration that dropped a link still has the link. No edit to a declaration
//   can fix that, and the backup cannot migrate someone else's database. But
//   leaving rows out only ever saves space, so the plan keeps the linked table's
//   rows in this one database and says so (`keptForLinks`). The archive stays
//   restorable; only its size pays.
//
// The fork never takes the lenient path: its source is always the running
// main database, whose schema is current.

/**
 * The declared backup exclusions cannot produce a restorable archive of the
 * running namespace's own database. Deterministic — the same declarations
 * against the same schema fail identically — so only an edit to a contribution
 * (or the schema) fixes it. Thrown before `pg_dump` runs.
 */
export class BackupPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupPlanError";
  }
}

/**
 * A declared exclusion this database's rows are KEPT for, because a kept table
 * still links to it (a schema older than the declarations — see the header).
 */
export interface KeptForLink {
  /** The declared table whose rows stay in the archive. */
  readonly table: string;
  /** The kept table whose foreign key forced it. */
  readonly linkedFrom: string;
  readonly constraint: string;
}

/** What `backupDatabase` ran with. */
export interface BackupPlan {
  /** `--exclude-table-data` arguments, each built from a name in the catalog. */
  readonly excludeTableData: readonly string[];
  /** The relations whose rows were left out (declared tables plus partition leaves). */
  readonly excludedTables: readonly string[];
  /** Declarations naming no table in this database, as human-readable lines. */
  readonly unmatched: readonly string[];
  /** Declarations whose rows were kept after all. Always empty when `strict`. */
  readonly keptForLinks: readonly KeptForLink[];
}

export interface BackupPlanOptions {
  /**
   * Refuse a kept → left-out link instead of keeping the rows. True for the
   * running namespace's own database only (see the header). Required, so every
   * caller decides.
   */
  readonly strict: boolean;
}

/**
 * Pure: every input is an argument.
 *
 * THROWS {@link BackupPlanError} when `strict` and a kept table links to a
 * left-out one. Otherwise un-excludes each linked-to table until no kept table
 * links to a left-out one — repeated, since keeping a table's rows can turn its
 * own link into another left-out table into a new kept → left-out link.
 * Terminates: every round keeps at least one more declared table.
 */
export function planBackupExclusions(
  catalog: SchemaCatalog,
  exclusions: BackupExclusions,
  { strict }: BackupPlanOptions,
): BackupPlan {
  const partitions =
    catalog.schemas.find((s) => s.name === APP_SCHEMA)?.partitions ?? {};
  // A link may name a partition leaf; the decision is about its declared parent.
  const declaredOwner = (relation: string, declared: readonly string[]) =>
    declared.find(
      (t) => t === relation || (partitions[t] ?? []).includes(relation),
    );

  let declared = [...exclusions.tables];
  const keptForLinks: KeptForLink[] = [];
  const first = planTableExclusions(catalog, declared);
  let plan = first;
  while (plan.keptLinks.length > 0) {
    if (strict) {
      throw new BackupPlanError(describeKeptLinks("backup", plan.keptLinks));
    }
    const kept = new Set<string>();
    for (const link of plan.keptLinks) {
      const owner = declaredOwner(link.references, declared);
      if (owner === undefined) {
        // `planTableExclusions` only reports links into relations it left out,
        // and it leaves out only declared tables and their leaves.
        throw new Error(
          `planBackupExclusions: "${link.references}" is left out but no declared table owns it`,
        );
      }
      kept.add(owner);
      keptForLinks.push({
        table: owner,
        linkedFrom: link.table,
        constraint: link.constraint,
      });
    }
    declared = declared.filter((t) => !kept.has(t));
    plan = planTableExclusions(catalog, declared);
  }
  return {
    excludeTableData: plan.excludeTableData,
    excludedTables: plan.excludedTables,
    // From the full declared set: a kept declaration still matched a table.
    unmatched: first.unmatched,
    keptForLinks,
  };
}

/**
 * {@link readSchemaCatalog} then {@link planBackupExclusions}, with the
 * database's NAME in any refusal — the pure planner is handed a catalog, not a
 * name, and a refusal that cannot say which database it was about is a riddle.
 */
export async function resolveBackupPlan(
  source: string,
  exclusions: BackupExclusions,
  options: BackupPlanOptions,
): Promise<BackupPlan> {
  try {
    return planBackupExclusions(
      await readSchemaCatalog(source),
      exclusions,
      options,
    );
  } catch (err) {
    if (err instanceof BackupPlanError) {
      throw new BackupPlanError(`database "${source}": ${err.message}`);
    }
    throw err;
  }
}
