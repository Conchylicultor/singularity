import { windowQueryResource } from "@plugins/infra/plugins/query-resource/server";
import { starredPagesResource as starredPagesDescriptor } from "../../shared/resources";
import { _pageBlocksStarredExt } from "./tables";

const t = _pageBlocksStarredExt;

// Compiled bounded window (desc createdAt, default 500 / max 1000). Starring is a
// membership ENTRY and unstarring a membership EXIT; both ship incremental
// deltas, never a whole-collection recompute.
//
// The window's order column is UPDATE-stable by construction: `pageBlocksStarred`
// is presence-only, so `upsert(pageId, {})` writes `createdAt` once at insert and
// on conflict only ever touches `updatedAt` — re-starring an already-starred page
// is an in-place refill with an unchanged order signature and zero ids queries.
//
// `createdAt` is projected because the compiler derives the order signature from
// the wire row and throws at module eval if an order column is unprojected.
export const starredPagesServerResource = windowQueryResource(
  starredPagesDescriptor,
  {
    from: t,
    select: {
      parentId: t.parentId,
      createdAt: t.createdAt,
    },
    orderBy: { col: t.createdAt, dir: "desc" },
    window: { maxLimit: 1000 },
  },
);
