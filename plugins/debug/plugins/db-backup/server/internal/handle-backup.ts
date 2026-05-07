import { mkdir } from "node:fs/promises";
import { BACKUPS_DIR } from "@plugins/infra/plugins/paths/server";
import { adminPool, libpqSubprocessEnv } from "@plugins/database/server";

export async function handleBackup(): Promise<Response> {

  const timestamp = new Date()
    .toISOString()
    .replace(/T/, "_")
    .replace(/:/g, "-")
    .slice(0, 19);
  const outDir = `${BACKUPS_DIR}/${timestamp}`;
  await mkdir(outDir, { recursive: true });

  const result = await adminPool.query<{ datname: string }>(
    `SELECT datname FROM pg_database
     WHERE datname NOT IN ('template0', 'template1', 'postgres')
       AND datname NOT LIKE 'claude-%'
       AND datname NOT LIKE 'att-%'
     ORDER BY datname`,
  );

  const results: { name: string; file: string }[] = [];

  for (const { datname } of result.rows) {
    const file = `${outDir}/${datname}.dump`;
    const proc = Bun.spawn(
      ["pg_dump", "-Fc", datname],
      { stdout: Bun.file(file), stderr: "pipe", env: { ...process.env, ...libpqSubprocessEnv } },
    );
    const code = await proc.exited;
    if (code !== 0) {
      const stderr = await new Response(proc.stderr).text();
      return Response.json(
        { ok: false, error: `pg_dump failed for ${datname}: ${stderr}` },
        { status: 500 },
      );
    }
    results.push({ name: datname, file });
  }

  return Response.json({ ok: true, outDir, databases: results });
}
