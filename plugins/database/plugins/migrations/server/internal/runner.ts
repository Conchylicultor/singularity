import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql as drizzleSql } from "drizzle-orm";
import { Log } from "@plugins/debug/plugins/logs/server";

const log = Log.channel("migrations", { persist: true });

const MIGRATION_RE = /^(\d{8})_(\d{6})_([0-9a-f]{8})__(.+)\.sql$/;

interface Migration {
  file: string;
  hash: string;
  sortKey: string;
  sqlText: string;
}

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

  // Drift warning: a hash recorded as applied but with no matching file on disk
  // means someone rebased away a migration after it ran here. The DB retains
  // whatever that migration did, silently diverging from the codebase.
  const onDiskHashes = new Set(migrations.map((m) => m.hash));
  for (const h of appliedHashes) {
    if (!onDiskHashes.has(h)) {
      log.publish(
        `[migrate] applied hash ${h} has no matching file on disk — DB may have drifted`,
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
}
