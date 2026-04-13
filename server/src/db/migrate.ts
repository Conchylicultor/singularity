import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { sql } from "./client";

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
    const [, date, time, hash] = m;
    return {
      file: f,
      hash,
      sortKey: `${date}${time}`,
      sqlText: readFileSync(join(dir, f), "utf8"),
    };
  });
  migrations.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return migrations;
}

export async function runMigrations(): Promise<void> {
  const dir = join(import.meta.dir, "migrations");
  const migrations = loadMigrations(dir);

  await sql`
    CREATE TABLE IF NOT EXISTS __singularity_migrations (
      hash text PRIMARY KEY,
      file text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  // Bootstrap: if we have never applied anything under this table but
  // Drizzle's old __drizzle_migrations table has rows, assume those
  // correspond to what's on disk and seed the hashes without re-running.
  const rows =
    await sql`SELECT 1 FROM __singularity_migrations LIMIT 1` as unknown as unknown[];
  if (rows.length === 0) {
    const drizzleExists = await sql`
      SELECT 1 FROM information_schema.tables
      WHERE table_name = '__drizzle_migrations' AND table_schema = 'drizzle'
    ` as unknown as unknown[];
    if (drizzleExists.length > 0) {
      const applied = await sql`
        SELECT count(*)::int AS c FROM drizzle.__drizzle_migrations
      ` as unknown as Array<{ c: number }>;
      const n = applied[0]?.c ?? 0;
      if (n > 0) {
        console.log(
          `[migrate] bootstrap: seeding __singularity_migrations from ${migrations.length} on-disk migrations (drizzle had ${n} applied)`,
        );
        for (const m of migrations) {
          await sql`
            INSERT INTO __singularity_migrations (hash, file)
            VALUES (${m.hash}, ${m.file})
            ON CONFLICT (hash) DO NOTHING
          `;
        }
        return;
      }
    }
  }

  const applied = (await sql`
    SELECT hash FROM __singularity_migrations
  `) as unknown as Array<{ hash: string }>;
  const appliedHashes = new Set(applied.map((r) => r.hash));

  for (const m of migrations) {
    if (appliedHashes.has(m.hash)) continue;
    console.log(`[migrate] applying ${m.file}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(m.sqlText);
      await tx`
        INSERT INTO __singularity_migrations (hash, file)
        VALUES (${m.hash}, ${m.file})
      `;
    });
  }
}

if (import.meta.main) {
  await runMigrations();
  console.log("Migrations applied");
  process.exit(0);
}
