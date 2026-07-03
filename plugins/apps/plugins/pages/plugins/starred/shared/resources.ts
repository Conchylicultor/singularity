import { z } from "zod";
import { queryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";

// One row per starred page. Presence in the table = starred; `rank` orders the
// Favorites section independently of the page tree's own rank.
export const StarredPageRowSchema = z.object({
  parentId: z.string(),
  rank: RankSchema,
});
export type StarredPageRow = z.infer<typeof StarredPageRowSchema>;

// Keyed query-resource contract: rows key on `parentId` (the side-table PK). The
// server half is compiled from the drizzle declaration in
// `server/internal/resource.ts` (K/full — `rank` is a mutable order-by column
// the Favorites sidebar renders in wire order, see the compiler's CLAUDE.md).
// The wire shape stays `StarredPageRow[]`.
export const starredPagesResource = queryResourceDescriptor<StarredPageRow>(
  "pages-starred",
  StarredPageRowSchema,
  "parentId",
);
