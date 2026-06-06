import type { ResourceFacetData } from "./types";

/** Diff projection: one "key (mode)" string per resource, server before central.
 *  Mirrors the legacy resourceStrings() (compute-plugin-diff.ts) so the diff
 *  output is identical. */
export function resourcesToComparable(data: ResourceFacetData): string[] {
  return [...data.server, ...data.central].map((r) => `${r.key} (${r.mode})`);
}
