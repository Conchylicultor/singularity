import { asc } from "drizzle-orm";
import { queryResource } from "@plugins/infra/plugins/query-resource/server";
import { starredPagesResource as starredPagesDescriptor } from "../../shared/resources";
import { _pageBlocksStarredExt } from "./tables";

// Compiled keyed query-resource, declared K/FULL (`recompute`), NOT
// identityTable-scoped: `rank` is a MUTABLE order-by column. A drag-reorder
// UPDATEs `rank` (movePageStarred), and the Favorites sidebar renders rows in
// wire order (no client-side re-sort) — a scoped delta omits `order`, so the
// reordered row would sit stale-positioned until the next FULL. The FULL
// recompute re-runs the ordered query and reships order, while the Layer-1 keyed
// diff still ships only the changed rows. `rank` is a compile-time brand over
// string (Rank), so the plain select's raw strings serialize identically and the
// wire RankSchema brands them on the client — no Rank.from map is needed.
export const starredPagesServerResource = queryResource(starredPagesDescriptor, {
  from: _pageBlocksStarredExt,
  select: {
    parentId: _pageBlocksStarredExt.parentId,
    rank: _pageBlocksStarredExt.rank,
  },
  orderBy: asc(_pageBlocksStarredExt.rank),
  recompute: {
    kind: "full",
    reason:
      "mutable order-by column: `rank` is UPDATEd on drag-reorder (movePageStarred), and the Favorites sidebar renders rows in wire order without re-sorting — a scoped refill omits `order`, so the reordered row would sit stale-positioned until the next FULL",
  },
});
