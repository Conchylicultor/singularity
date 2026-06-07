import { useMemo } from "react";
import type { DiffList, PluginChangeDiff } from "../core";
import { PluginChanges } from "./slots";

/** One facet's added/removed projection for a plugin, ready to render. */
export interface FacetDiff {
  facetId: string;
  label: string;
  diff: DiffList;
}

function diffSets(current: string[], main: string[]): DiffList {
  const mainSet = new Set(main);
  const currentSet = new Set(current);
  return {
    added: current.filter((x) => !mainSet.has(x)),
    removed: main.filter((x) => !currentSet.has(x)),
  };
}

function toComparable(
  renderer: { toComparable: (data: unknown) => string[]; facetId: string },
  facets: Record<string, unknown>,
): string[] {
  const data = facets[renderer.facetId];
  return data === undefined ? [] : renderer.toComparable(data);
}

/**
 * Computes per-facet added/removed diffs for a plugin by iterating every
 * contributed `PluginChanges.DiffRenderer` and comparing its `toComparable`
 * projection of the worktree facet data against main. Returns only facets that
 * actually changed, in slot-registration order. The server stays facet-blind —
 * this is the single place the diff is derived (used by both the section and the
 * summary badge so their counts never drift).
 */
export function usePluginFacetDiffs(plugin: PluginChangeDiff): FacetDiff[] {
  const renderers = PluginChanges.DiffRenderer.useContributions();
  return useMemo(
    () =>
      renderers
        .map((r) => ({
          facetId: r.facetId,
          label: r.label,
          diff: diffSets(
            toComparable(r, plugin.currentFacets),
            toComparable(r, plugin.mainFacets),
          ),
        }))
        .filter((fd) => fd.diff.added.length > 0 || fd.diff.removed.length > 0),
    [renderers, plugin],
  );
}
