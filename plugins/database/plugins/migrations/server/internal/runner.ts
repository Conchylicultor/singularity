import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql as drizzleSql } from "drizzle-orm";
import { Log } from "@plugins/primitives/plugins/log-channels/server";
import { rebuildDerivedViews } from "@plugins/database/plugins/derived-views/server";
import { MIGRATIONS_TABLE_NAME } from "@plugins/database/plugins/derived-views/core";

const log = Log.channel("migrations", { persist: true });

const MIGRATION_RE = /^(\d{8})_(\d{6})_([0-9a-f]{8})__(.+)\.sql$/;

const MIGRATIONS_DIR = join(import.meta.dir, "..", "..", "data");

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

    for (const m of migrations) {
      if (appliedHashes.has(m.hash)) continue;
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
  const pending = listMigrationFiles(MIGRATIONS_DIR).filter(
    (m) => !applied.has(m.hash),
  );
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
