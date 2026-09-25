import { windowQueryResource } from "@plugins/infra/plugins/query-resource/server";
import { starredPagesResource as starredPagesDescriptor } from "../../shared/resources";
import { pageBlocksStarred } from "./tables";

const t = pageBlocksStarred.table;

// Compiled bounded window (desc createdAt, default 500 / max 1000). Starring is a
// membership ENTRY and unstarring a membership EXIT; both ship incremental
// deltas, never a whole-collection recompute.
//
// The window's order column is UPDATE-stable by construction: `pageBlocksStarred`
// is presence-only, so `upsert(pageId, {})` writes `createdAt` once at insert and
// on conflict only rewrites the key with its own value (a no-op) — re-starring an
// already-starred page is an in-place refill with an unchanged order signature and zero ids queries.
//
// No `select`: the projection is the extension's wire columns, which carry
// `createdAt` (a `wireTimestamps` entry of the shape) — the compiler derives the
// order signature from the wire row and throws at module eval if an order
// column is unprojected.
export const starredPagesServerResource = windowQueryResource(
  starredPagesDescriptor,
  {
    from: pageBlocksStarred,
    orderBy: { col: t.createdAt, dir: "desc" },
    window: { maxLimit: 1000 },
  },
);
