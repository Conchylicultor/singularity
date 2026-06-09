import { RUNTIME_FOLDERS, asPath } from "@plugins/framework/plugins/plugin-id/core";
import type { CrossRefsData } from "./types";

// Diff projection: the deduped union of apiUses across all runtimes. importedBy is a
// derived reverse index (depends on OTHER plugins), so it is intentionally excluded.
export function crossRefsToComparable(data: CrossRefsData): string[] {
  const uses = new Set<string>();
  for (const rt of RUNTIME_FOLDERS)
    for (const u of data.apiUses[rt])
      uses.add(`${asPath(u.plugin)}${u.symbol ? "." + u.symbol : ""}`);
  return [...uses];
}
