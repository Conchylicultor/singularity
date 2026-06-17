import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql as drizzleSql } from "drizzle-orm";
import { Log } from "@plugins/primitives/plugins/log-channels/server";

const log = Log.channel("migrations", { persist: true });

const MIGRATION_RE = /^(\d{8})_(\d{6})_([0-9a-f]{8})__(.+)\.sql$/;

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

function loadMigrations(dir: string): Migration[] {
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

export async function runMigrations(db: NodePgDatabase): Promise<void> {
  try {
    const dir = join(import.meta.dir, "..", "..", "data");
    const migrations = loadMigrations(dir);

    await db.execute(drizzleSql`
      CREATE TABLE IF NOT EXISTS __singularity_migrations (
        hash text PRIMARY KEY,
        file text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const applied = await db.execute<{ hash: string }>(
      drizzleSql`SELECT hash FROM __singularity_migrations`,
    );
    const appliedHashes = new Set(applied.rows.map((r) => r.hash));

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
          drizzleSql`INSERT INTO __singularity_migrations (hash, file) VALUES (${m.hash}, ${m.file})`,
        );
      });
    }
    resolveMigrationsReady();
  } catch (err) {
    rejectMigrationsReady(err);
    throw err;
  }
}
