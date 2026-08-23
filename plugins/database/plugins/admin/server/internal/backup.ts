import { stat } from "node:fs/promises";
import { queryRows } from "@plugins/database/plugins/sql-rows/core";
import { z } from "zod";
import { libpqSubprocessEnv, openShortLivedClient } from "./pool";

export type TableStat = {
  name: string;
  rowCount: number;
};

export type BackupInfo = {
  name: string;
  sizeBytes: number;
  tables: TableStat[];
};

export async function backupDatabase(
  name: string,
  outFile: string,
): Promise<void> {
  const proc = Bun.spawn(["pg_dump", "-Fc", name], {
    stdout: Bun.file(outFile),
    stderr: "pipe",
    env: { ...process.env, ...libpqSubprocessEnv() },
  });
  const code = await proc.exited;
  if (code !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`pg_dump failed for ${name}: ${stderr}`);
  }
}

/**
 * `n_live_tup` is `bigint`, and `pg` hands a `bigint` back as a STRING — a row
 * count can exceed 2^53, so there is no number it could losslessly decode to.
 * The schema says so; `readTableStats` converts it below, which is safe because
 * the value only ever becomes a cosmetic manifest label.
 */
const TableStatRowSchema = z.object({
  relname: z.string(),
  n_live_tup: z.string(),
});

// Table + estimated-row stats read straight from the source DB catalog. This is
// a cheap metadata query against pg_stat_user_tables — it never decompresses the
// dump. `n_live_tup` is Postgres's own live-row estimate (kept current by
// autovacuum/ANALYZE), which is exactly what the cosmetic manifest label needs;
// the previous approach ran `pg_restore --data-only` to re-decompress the whole
// dump and count every row line-by-line in JS, roughly doubling the dump cost.
async function readTableStats(name: string): Promise<TableStat[]> {
  const pool = openShortLivedClient(name);
  try {
    const rows = await queryRows(pool, {
      // `relname` is a `name`, cast so the column decodes as the `text` the
      // schema declares.
      sql: `SELECT relname::text AS relname, n_live_tup
              FROM pg_stat_user_tables ORDER BY relname`,
      row: TableStatRowSchema,
    });
    return rows.map((r) => ({
      name: r.relname,
      rowCount: Number(r.n_live_tup),
    }));
  } finally {
    await pool.end();
  }
}

export async function inspectBackup(
  file: string,
  name: string,
): Promise<BackupInfo> {
  const [fileStat, tables] = await Promise.all([
    stat(file),
    readTableStats(name),
  ]);
  return { name, sizeBytes: fileStat.size, tables };
}
