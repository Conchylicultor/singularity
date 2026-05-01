import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

export type TableStat = {
  name: string;
  rowCount: number;
};

export type DumpStats = {
  name: string;
  sizeBytes: number;
  tables: TableStat[];
};

export type BackupEntry = {
  id: string;
  dir: string;
  databases: DumpStats[];
  totalSizeBytes: number;
};

async function getTableNames(file: string): Promise<string[]> {
  try {
    const proc = Bun.spawn(["pg_restore", "--list", file], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    const output = await new Response(proc.stdout).text();
    return output
      .split("\n")
      .flatMap((line) => {
        if (line.startsWith(";") || !line.trim()) return [];
        const parts = line.trim().split(/\s+/);
        // Format: id; oid1 oid2 TABLE schema tablename owner
        if (parts[3] === "TABLE" && parts[4] !== "DATA") return [parts[5] ?? ""];
        return [];
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function getRowCounts(file: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  try {
    const proc = Bun.spawn(["pg_restore", "--data-only", "-f", "-", file], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    const output = await new Response(proc.stdout).text();

    let currentTable: string | null = null;
    let count = 0;

    for (const line of output.split("\n")) {
      if (line.startsWith("COPY ")) {
        // "COPY schema.tablename (...) FROM stdin;" — extract last component before " ("
        const parenIdx = line.indexOf(" (");
        const tableSpec = line.slice(5, parenIdx);
        const dotIdx = tableSpec.lastIndexOf(".");
        const raw = dotIdx >= 0 ? tableSpec.slice(dotIdx + 1) : tableSpec;
        currentTable = raw.replace(/^"|"$/g, "");
        count = 0;
      } else if (line === "\\.") {
        if (currentTable !== null) counts[currentTable] = count;
        currentTable = null;
      } else if (currentTable !== null && line !== "") {
        count++;
      }
    }
  } catch {
    // noop
  }
  return counts;
}

async function getDumpStats(file: string, name: string): Promise<DumpStats> {
  const [fileStat, tableNames, rowCounts] = await Promise.all([
    stat(file),
    getTableNames(file),
    getRowCounts(file),
  ]);
  const tables: TableStat[] = tableNames.map((tableName) => ({
    name: tableName,
    rowCount: rowCounts[tableName] ?? 0,
  }));
  return { name, sizeBytes: fileStat.size, tables };
}

export async function listBackups(): Promise<Response> {
  const baseDir = `${homedir()}/.backups/singularity`;

  let entries: string[];
  try {
    entries = await readdir(baseDir);
  } catch {
    return Response.json({ ok: true, backups: [] });
  }

  const backupDirs = entries
    .filter((e) => /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/.test(e))
    .sort()
    .reverse();

  const backups: BackupEntry[] = await Promise.all(
    backupDirs.map(async (id) => {
      const dir = join(baseDir, id);
      let dumpFiles: string[];
      try {
        dumpFiles = (await readdir(dir)).filter((f: string) => f.endsWith(".dump"));
      } catch {
        dumpFiles = [];
      }
      const databases = await Promise.all(
        dumpFiles.map((f: string) => getDumpStats(join(dir, f), f.replace(/\.dump$/, ""))),
      );
      const totalSizeBytes = databases.reduce((sum, d) => sum + d.sizeBytes, 0);
      return { id, dir, databases, totalSizeBytes };
    }),
  );

  return Response.json({ ok: true, backups });
}
