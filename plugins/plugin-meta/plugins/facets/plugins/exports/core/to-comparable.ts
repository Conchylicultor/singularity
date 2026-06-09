import { RUNTIME_FOLDERS } from "@plugins/framework/plugins/plugin-id/core";
import type { ExportsData } from "./types";

/** Diff projection: one `"<runtime>: <name>"` string per exported symbol. */
export function exportsToComparable(data: ExportsData): string[] {
  const result: string[] = [];
  for (const runtime of RUNTIME_FOLDERS)
    for (const sym of data[runtime]) result.push(`${runtime}: ${sym.name}`);
  return result;
}
