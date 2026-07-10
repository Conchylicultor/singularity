import { z } from "zod";
import { queryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";

// One row per starred page. Presence in the table = starred; the row carries no
// order — the Favorites view's row order lives in data-view's `view-order`.
export const StarredPageRowSchema = z.object({
  parentId: z.string(),
});
export type StarredPageRow = z.infer<typeof StarredPageRowSchema>;

// Keyed query-resource contract: rows key on `parentId` (the side-table PK). The
// server half is compiled from the drizzle declaration in
// `server/internal/resource.ts` (default identityTable-scoped keyed resource).
// The wire shape stays `StarredPageRow[]`.
export const starredPagesResource = queryResourceDescriptor<StarredPageRow>(
  "pages-starred",
  StarredPageRowSchema,
  "parentId",
);
