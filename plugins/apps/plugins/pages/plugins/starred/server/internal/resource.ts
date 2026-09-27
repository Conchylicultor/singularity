import { serveCollection } from "@plugins/network/plugins/live/server";
import { starredPages } from "../../shared/resources";
import { pageBlocksStarred } from "./tables";

// Served from the extension handle (its wire columns — `blockId` is the
// `parent_id` PK, `createdAt` a `wireTimestamps` entry of the shape). Starring
// is a window membership ENTRY and unstarring a membership EXIT; both ship
// incremental deltas, never a whole-collection recompute.
//
// The window's order column is UPDATE-stable by construction: `pageBlocksStarred`
// is presence-only, so `upsert(pageId, {})` writes `createdAt` once at insert and
// on conflict only rewrites the key with its own value (a no-op) — re-starring an
// already-starred page is an in-place refill with an unchanged order signature
// and zero ids queries.
export const starredPagesServed = serveCollection(starredPages, {
  from: pageBlocksStarred,
});
