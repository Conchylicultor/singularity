import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";

// One row per starred page. Presence in the table = starred; `rank` orders the
// Favorites section independently of the page tree's own rank.
export const StarredPageRowSchema = z.object({
  parentId: z.string(),
  rank: RankSchema,
});
export type StarredPageRow = z.infer<typeof StarredPageRowSchema>;

export const starredPagesResource = resourceDescriptor<StarredPageRow[]>(
  "pages-starred",
  z.array(StarredPageRowSchema),
  [],
);
