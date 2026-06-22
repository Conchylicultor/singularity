import { z } from "zod";

export interface DiffList {
  added: string[];
  removed: string[];
}

export const PluginChangedFileSchema = z.object({
  path: z.string(),
  status: z.string(),
  additions: z.number(),
  deletions: z.number(),
  from: z.string().optional(),
});
export type PluginChangedFile = z.infer<typeof PluginChangedFileSchema>;

export const PluginChangeDiffSchema = z.object({
  pluginId: z.string(),
  name: z.string(),
  path: z.string(),
  status: z.enum(["added", "modified"]),
  fileCount: z.number(),
  additions: z.number(),
  deletions: z.number(),
  files: z.array(PluginChangedFileSchema),
  /** Raw facet data (`node.facets`) for this plugin in the worktree. The server
   *  is facet-blind: it ships the data and the client computes per-facet diffs by
   *  iterating the `PluginChanges.DiffRenderer` slot (see `usePluginFacetDiffs`). */
  currentFacets: z.record(z.unknown()),
  /** Raw facet data for the same plugin on main (`{}` when newly added). */
  mainFacets: z.record(z.unknown()),
});
export type PluginChangeDiff = z.infer<typeof PluginChangeDiffSchema>;

export const PluginChangesSchema = z.object({
  plugins: z.array(PluginChangeDiffSchema),
});
export type PluginChangesResponse = z.infer<typeof PluginChangesSchema>;

export interface PluginReviewProps {
  conversationId: string;
  plugin: PluginChangeDiff;
}
