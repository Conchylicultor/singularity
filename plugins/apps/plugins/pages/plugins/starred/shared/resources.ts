import { z } from "zod";
import { windowQueryResourceDescriptor } from "@plugins/infra/plugins/query-resource/core";

// One row per starred page. Presence in the table = starred; the row carries no
// order of its own — the Favorites view's row order lives in data-view's
// `view-order`. `createdAt` (when the page was starred) is the WINDOW's order
// key, and is on the wire because the compiler derives the order signature from
// the wire row and throws at module eval if an order column is unprojected.
export const StarredPageRowSchema = z.object({
  parentId: z.string(),
  createdAt: z.coerce.date(),
});
export type StarredPageRow = z.infer<typeof StarredPageRowSchema>;

// Bounded ordered WINDOW (desc createdAt — most recently starred first), NOT a
// point resource: the dominant consumer is `StarredField`, which needs
// starred-ness for EVERY row the `pages-sidebar` DataView filters over. A point
// subscription would have to name every page id, which is O(pages) — that does
// not bound the working set, it only moves it into a params string. What is
// bounded here is the favorites set itself, so the window bounds the right thing.
// Mirrors the sibling `agent-origin` plugin, which contributes the same kind of
// Set-backed field into the same `PageTree.Fields` slot.
//
// Sized above the other window resources (200/500): favorites are user-curated
// and have no TTL, so they only accumulate. The boundary is real but far out —
// past `maxLimit` favorites the oldest-starred page reads as unstarred (hollow
// star, absent from Favorites).
//
// Rows key on `parentId` (the side-table pk); the server half is compiled from
// the drizzle declaration in `server/internal/resource.ts`. Web consumers read it
// through `useStarredPageIds` (web/internal/use-starred-ids.ts); the wire shape
// stays `StarredPageRow[]`.
export const starredPagesResource =
  windowQueryResourceDescriptor<StarredPageRow>(
    "pages-starred",
    StarredPageRowSchema,
    "parentId",
    { defaultLimit: 500 },
  );
