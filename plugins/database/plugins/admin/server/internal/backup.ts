import { stat } from "node:fs/promises";
import { libpqSubprocessEnv } from "./pool";

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
    env: { ...process.env, ...libpqSubprocessEnv },
  });
  const code = await proc.exited;
  if (code !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`pg_dump failed for ${name}: ${stderr}`);
  }
}

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

export async function inspectBackup(
  file: string,
  name: string,
): Promise<BackupInfo> {
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
