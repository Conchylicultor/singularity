import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// Toggle a page's starred state. Server computes the append rank when starring
// and deletes the side-table row when unstarring.
export const putPageStarred = defineEndpoint({
  route: "PUT /api/pages/:pageId/starred",
  body: z.object({ starred: z.boolean() }),
});

// Reorder a starred page within Favorites. The client computes the new rank
// (Rank.between of the new neighbors) and sends its string form.
export const movePageStarred = defineEndpoint({
  route: "POST /api/pages/:pageId/starred/move",
  body: z.object({ rank: z.string() }),
});
