import type { ExportsData } from "./types";

/** Diff projection: one `"<runtime>: <name>"` string per exported symbol.
 *  Mirrors the legacy exportStrings() (compute-plugin-diff.ts) — runtimes
 *  web/server/central/core; `shared` intentionally omitted to preserve identical diff output. */
export function exportsToComparable(data: ExportsData): string[] {
  const result: string[] = [];
  for (const runtime of ["web", "server", "central", "core"] as const) {
    for (const sym of data[runtime]) result.push(`${runtime}: ${sym.name}`);
  }
  return result;
}
