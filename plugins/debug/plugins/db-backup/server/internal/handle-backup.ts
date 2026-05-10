import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { BACKUPS_DIR } from "@plugins/infra/plugins/paths/server";
import { listDatabases, backupDatabase } from "@plugins/database/plugins/admin/server";

export async function handleBackup(): Promise<Response> {
  const timestamp = new Date()
    .toISOString()
    .replace(/T/, "_")
    .replace(/:/g, "-")
    .slice(0, 19);
  const outDir = `${BACKUPS_DIR}/${timestamp}`;
  await mkdir(outDir, { recursive: true });

  const allDbs = await listDatabases();
  const targetDbs = allDbs.filter(
    (name) => !name.startsWith("claude-") && !name.startsWith("att-"),
  );

  const results: { name: string; file: string }[] = [];

  for (const datname of targetDbs) {
    const file = join(outDir, `${datname}.dump`);
    try {
      await backupDatabase(datname, file);
    } catch (err) {
      return Response.json(
        { ok: false, error: String(err) },
        { status: 500 },
      );
    }
    results.push({ name: datname, file });
  }

  return Response.json({ ok: true, outDir, databases: results });
}
