import type { StoryNode } from "@plugins/apps/plugins/story/plugins/story-core/core";

export type BlogUnit = { unitId: string; nodes: StoryNode[] };

/**
 * Segments the outline into independently-generated blog units.
 *
 * v1: ONE unit = the whole article (`unitId: "article"`). This is the seam
 * where per-section granularity drops in later — switch to one unit per
 * top-level node (`unitId = node.id`) and the generation primitive, prompt
 * path, and renderer states all keep working unchanged.
 */
export function segmentBlog(story: StoryNode[]): BlogUnit[] {
  return [{ unitId: "article", nodes: story }];
}
