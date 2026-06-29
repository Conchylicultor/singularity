import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql as drizzleSql } from "drizzle-orm";
import { Log } from "@plugins/primitives/plugins/log-channels/server";
import { rebuildDerivedViews } from "@plugins/database/plugins/derived-views/server";
import { MIGRATIONS_TABLE_NAME } from "@plugins/database/plugins/derived-views/core";

const log = Log.channel("migrations", { persist: true });

const MIGRATION_RE = /^(\d{8})_(\d{6})_([0-9a-f]{8})__(.+)\.sql$/;

// A packaged release reads the migration SQL files from a vendored dir via env
// override: `import.meta.dir` resolves into the compiled binary's virtual FS
// (not a real on-disk path), so the `../../data` relative lookup can't find the
// `.sql` files. The release vendors `data/` and points here. When unset (dev),
// resolve relative to this module as before.
const MIGRATIONS_DIR =
  process.env.SINGULARITY_MIGRATIONS_DIR ??
  join(import.meta.dir, "..", "..", "data");

interface Migration {
  file: string;
  hash: string;
  sortKey: string;
  sqlText: string;
}

// Completion barrier for migrations. A parallel `onReadyBlocking` hook (e.g. the
// boot-snapshot warm-up) can await this instead of relying on hook ordering —
// `onReadyBlocking` hooks run in parallel. `runMigrations` settles it: resolves
// when migrations complete, rejects if they throw. See
// research/2026-06-14-global-cold-load-instant-boot.md.
let resolveMigrationsReady!: () => void;
let rejectMigrationsReady!: (err: unknown) => void;
export const migrationsReady: Promise<void> = new Promise<void>((resolve, reject) => {
  resolveMigrationsReady = resolve;
  rejectMigrationsReady = reject;
});

// Ordered list of every migration file on disk (timestamp order — the order the
// runner applies them). Shared by `runMigrations` and `dryRunPendingMigrations`.
function listMigrationFiles(dir: string): Migration[] {
  const files = readdirSync(dir).filter((f) => MIGRATION_RE.test(f));
  const migrations: Migration[] = files.map((f) => {
    const m = MIGRATION_RE.exec(f)!;
    const [, date, time, hash] = m as RegExpExecArray;
    return {
      file: f,
      hash: hash!,
      sortKey: `${date!}${time!}`,
      sqlText: readFileSync(join(dir, f), "utf8"),
    };
  });
  migrations.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return migrations;
}

// Hashes already recorded in __singularity_migrations (the applied-state ledger).
// Creates the ledger table if absent, so callers can use the result directly.
async function getAppliedHashes(db: NodePgDatabase): Promise<Set<string>> {
  await db.execute(drizzleSql`
    CREATE TABLE IF NOT EXISTS ${drizzleSql.raw(MIGRATIONS_TABLE_NAME)} (
      hash text PRIMARY KEY,
      file text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const applied = await db.execute<{ hash: string }>(
    drizzleSql`SELECT hash FROM ${drizzleSql.raw(MIGRATIONS_TABLE_NAME)}`,
  );
  return new Set(applied.rows.map((r) => r.hash));
}

// PURE (exported for unit testing): given the ordered migration list and the
// hashes already in the ledger, decide which to apply and which to skip as
// same-run duplicate-hash siblings. Mutates nothing.
//
// WHY skip-by-hash is correct: the ledger (__singularity_migrations) keys applied
// state by the filename sha8, which is its PRIMARY KEY. Two files carrying the
// same sha8 are byte-identical content (e.g. a `CREATE TABLE IF NOT EXISTS` that
// legitimately recurs in schema history after an add then later remove). The
// first occurrence applies and records its hash; the second carries the SAME
// content, so re-running it would (a) be a no-op for the identical DDL and
// (b) attempt a duplicate INSERT of the same PK → unique-constraint violation.
// We therefore apply the first and skip the rest — but loudly (see callers),
// never silently.
export function planMigrations(
  migrations: Migration[],
  appliedHashes: ReadonlySet<string>,
): { toApply: Migration[]; skippedDuplicates: { file: string; original: string }[] } {
  const toApply: Migration[] = [];
  const skippedDuplicates: { file: string; original: string }[] = [];
  // hash → first file in THIS list that we plan to apply for that hash.
  const firstFileForHash = new Map<string, string>();

  for (const m of migrations) {
    if (firstFileForHash.has(m.hash)) {
      // A same-run sibling: an earlier file in this list already owns this hash.
      // Identical content; skipping the second is a no-op (and avoids a
      // duplicate-PK INSERT). Reported loudly by the caller.
      skippedDuplicates.push({ file: m.file, original: firstFileForHash.get(m.hash)! });
      continue;
    }
    if (appliedHashes.has(m.hash)) {
      // Normal prior-boot skip: already in the ledger. Not a collision — record
      // it as the owner so a later byte-identical sibling is still recognized as
      // a duplicate of THIS file, but don't re-apply or report it.
      firstFileForHash.set(m.hash, m.file);
      continue;
    }
    firstFileForHash.set(m.hash, m.file);
    toApply.push(m);
  }

  return { toApply, skippedDuplicates };
}

export async function runMigrations(db: NodePgDatabase): Promise<void> {
  try {
    const migrations = listMigrationFiles(MIGRATIONS_DIR);
    const appliedHashes = await getAppliedHashes(db);

    // Applied-but-no-file: a hash recorded as applied with no matching file on
    // this branch. This is EXPECTED when the worktree branch predates a
    // migration that landed on main — the DB was forked from main (or merged it)
    // and already carries that migration's effects, but the branch checkout
    // doesn't have the file yet. It is only real drift if you deleted a migration
    // you authored (rebased it away after it ran here), in which case the DB
    // keeps whatever that migration did. No rollback either way.
    const onDiskHashes = new Set(migrations.map((m) => m.hash));
    for (const h of appliedHashes) {
      if (!onDiskHashes.has(h)) {
        log.publish(
          `[migrate] applied hash ${h} has no file on this branch — expected if this worktree predates a migration that landed on main (the DB already has its effects). Real drift only if you deleted a migration you authored.`,
          "stderr",
        );
      }
    }

    const { toApply, skippedDuplicates } = planMigrations(migrations, appliedHashes);

    // Loudly report every same-run duplicate-hash skip. Identical DDL, so this is
    // a no-op for the DB, but it must never be silent ("fail loudly" rule): a
    // surprise collision means two files share a sha8 and one is being ignored.
    for (const { file, original } of skippedDuplicates) {
      log.publish(
        `[migrate] skipping ${file}: its sha8 hash is byte-identical to ${original}, which is being applied in this run. The ledger PK is the sha8, so re-applying would duplicate-key; the identical DDL makes the skip a no-op.`,
        "stderr",
      );
    }

    for (const m of toApply) {
      log.publish(`[migrate] applying ${m.file}`);
      await db.transaction(async (tx) => {
        await tx.execute(drizzleSql.raw(m.sqlText));
        await tx.execute(
          drizzleSql`INSERT INTO ${drizzleSql.raw(MIGRATIONS_TABLE_NAME)} (hash, file) VALUES (${m.hash}, ${m.file})`,
        );
      });
    }
    resolveMigrationsReady();
  } catch (err) {
    rejectMigrationsReady(err);
    throw err;
  }
}

// Force-rollback sentinel: thrown to abort the dry-run transaction so it never
// commits. Distinguished from a real error in the catch below.
const ROLLBACK = Symbol("dry-run-rollback");

// Prove that the pending migrations apply cleanly on top of the connected DB's
// current state, then ROLL BACK — leaving the DB byte-identical. Used by the
// `migration-applies-clean` check against the live main DB: the only way a
// migration "breaks main" is by erroring during boot's onReadyBlocking, so
// replaying the pending delta against main's real schema + data reproduces that
// exactly, while the rollback keeps it side-effect-free.
//
// All pending migrations run in ONE transaction so a later migration sees an
// earlier one's DDL (e.g. ADD COLUMN then backfill). Boot applies them one
// transaction each, but for "does the delta apply" the single-transaction net
// effect is equivalent.
//
// Note: a rolled-back INSERT still advances any serial/identity sequence
// (nextval is non-transactional), so a dry-run can leave harmless ID gaps. No
// data is changed; this is expected and ignorable.
export async function dryRunPendingMigrations(
  db: NodePgDatabase,
): Promise<{ pending: number }> {
  const applied = await getAppliedHashes(db);
  // Same skip-by-hash logic as runMigrations: two pending files sharing a sha8
  // are byte-identical, and applying both in this single transaction would
  // attempt a duplicate-PK INSERT and abort the dry-run. planMigrations drops
  // the same-run duplicate so the dry-run mirrors real boot behavior.
  const pending = planMigrations(listMigrationFiles(MIGRATIONS_DIR), applied).toApply;
  if (pending.length === 0) return { pending: 0 };

  try {
    await db.transaction(async (tx) => {
      // statement_timeout is the LOAD-BEARING safety bound: it caps how long the
      // dry-run can hold locks on the live main DB. lock_timeout bounds the wait
      // to ACQUIRE a lock so the dry-run can never queue behind live traffic.
      await tx.execute(drizzleSql`SET LOCAL lock_timeout = '1s'`);
      await tx.execute(drizzleSql`SET LOCAL statement_timeout = '60s'`);
      for (const m of pending) {
        try {
          await tx.execute(drizzleSql.raw(m.sqlText));
        } catch (e) {
          throw new Error(
            `migration ${m.file} failed to apply: ${(e as Error).message}`,
          );
        }
      }
      // Mirror onReadyBlocking's next step (runMigrations → rebuildDerivedViews):
      // a view referencing a column a migration drops would also crash boot. Also
      // rolled back.
      await rebuildDerivedViews(tx);
      throw ROLLBACK; // force ROLLBACK; never commit
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
  return { pending: pending.length };
}
