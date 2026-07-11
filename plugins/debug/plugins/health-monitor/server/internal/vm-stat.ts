// Pure `vm_stat` output parsing — kept free of log-channel/server imports so
// the parser stays testable with a plain co-located bun:test.

export interface VmStat {
  pageSize: number;
  map: Record<string, number>;
}

export function parseVmStat(text: string): VmStat {
  const pageSizeMatch = text.match(/page size of (\d+) bytes/);
  const pageSize = pageSizeMatch ? Number(pageSizeMatch[1]) : 16384;
  const map: Record<string, number> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Za-z][\w .()/-]+?):\s+(\d+)\.?\s*$/);
    if (m) map[m[1]!.trim()] = Number(m[2]);
  }
  return { pageSize, map };
}
