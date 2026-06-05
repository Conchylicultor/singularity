import type { CrossRefsData } from "./types";

const RUNTIMES = ["server", "central", "web", "core", "shared"] as const;

// Diff projection: the deduped union of apiUses across all runtimes. Mirrors the
// legacy apiUseStrings() (compute-plugin-diff.ts) so the diff output is identical.
// `shared` is empty in practice (cross-plugin imports from shared/ are forbidden),
// so iterating it is harmless. importedBy is a derived reverse index that changes
// based on OTHER plugins, so it is intentionally excluded from a per-plugin diff.
export function crossRefsToComparable(data: CrossRefsData): string[] {
  const uses = new Set<string>();
  for (const rt of RUNTIMES) for (const u of data.apiUses[rt]) uses.add(u);
  return [...uses];
}
