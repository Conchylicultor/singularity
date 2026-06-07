export interface DiffList {
  added: string[];
  removed: string[];
}

export interface PluginChangedFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  from?: string;
}

export interface PluginChangeDiff {
  hierarchyId: string;
  name: string;
  path: string;
  status: "added" | "modified";
  fileCount: number;
  additions: number;
  deletions: number;
  files: PluginChangedFile[];
  /** Raw facet data (`node.facets`) for this plugin in the worktree. The server
   *  is facet-blind: it ships the data and the client computes per-facet diffs by
   *  iterating the `PluginChanges.DiffRenderer` slot (see `usePluginFacetDiffs`). */
  currentFacets: Record<string, unknown>;
  /** Raw facet data for the same plugin on main (`{}` when newly added). */
  mainFacets: Record<string, unknown>;
}

export interface PluginChangesResponse {
  plugins: PluginChangeDiff[];
}

export interface PluginReviewProps {
  conversationId: string;
  plugin: PluginChangeDiff;
}
