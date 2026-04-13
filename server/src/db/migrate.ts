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

  const applied = (await sql`
    SELECT hash FROM __singularity_migrations
  `) as unknown as Array<{ hash: string }>;
  const appliedHashes = new Set(applied.map((r) => r.hash));

  // Drift warning: a hash recorded as applied but with no matching file on disk
  // means someone rebased away a migration after it ran here. The DB retains
  // whatever that migration did, silently diverging from the codebase.
  const onDiskHashes = new Set(migrations.map((m) => m.hash));
  for (const h of appliedHashes) {
    if (!onDiskHashes.has(h)) {
      console.warn(
        `[migrate] applied hash ${h} has no matching file on disk — DB may have drifted`,
      );
    }
  }

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
