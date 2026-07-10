import { queryResource } from "@plugins/infra/plugins/query-resource/server";
import { starredPagesResource as starredPagesDescriptor } from "../../shared/resources";
import { _pageBlocksStarredExt } from "./tables";

// Compiled keyed query-resource — the default identityTable-scoped keyed
// resource. Presence-only: each row is just `parentId`, so a star/unstar ships a
// cheap keyed delta and no order-by is needed (the Favorites view's row order
// lives in data-view's `view-order`).
export const starredPagesServerResource = queryResource(starredPagesDescriptor, {
  from: _pageBlocksStarredExt,
  select: {
    parentId: _pageBlocksStarredExt.parentId,
  },
});
