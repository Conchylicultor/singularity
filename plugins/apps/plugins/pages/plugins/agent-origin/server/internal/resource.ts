import { serveCollection } from "@plugins/network/plugins/live/server";
import { agentPages } from "../../shared/resources";
import { pageBlocksOrigin } from "./tables";

// Served from the extension handle (its wire columns — `blockId` is the
// `parent_id` PK, `createdAt` a `wireTimestamps` entry of the shape). Every
// column of the marker is immutable post-insert — a marker is written once by
// the create hook and deleted by the sweep, never updated — so the window's
// order column is UPDATE-stable by construction (the `WindowOrderKey` rule).
// Marking a page is a membership ENTRY and sweeping it a membership EXIT; both
// ship incremental deltas, never a whole-collection recompute.
export const agentPagesServed = serveCollection(agentPages, {
  from: pageBlocksOrigin,
});
