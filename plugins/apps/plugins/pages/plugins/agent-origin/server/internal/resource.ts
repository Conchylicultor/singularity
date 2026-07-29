import { windowQueryResource } from "@plugins/infra/plugins/query-resource/server";
import { agentPagesResource as agentPagesDescriptor } from "../../shared/resources";
import { _pageBlocksOriginExt } from "./tables";

// Compiled bounded window (desc createdAt, default 200 / max 500). Every column
// of the marker is immutable post-insert — a marker is written once by the
// create hook and deleted by the sweep, never updated — so the window's order
// column is UPDATE-stable by construction (the `WindowOrderKey` rule). Marking
// a page is a membership ENTRY and sweeping it a membership EXIT; both ship
// incremental deltas, never a whole-collection recompute. `createdAt` is
// projected because the compiler derives the order signature from the wire row
// and throws at module eval if an order column is unprojected.
export const agentPagesServerResource = windowQueryResource(agentPagesDescriptor, {
  from: _pageBlocksOriginExt,
  select: {
    parentId: _pageBlocksOriginExt.parentId,
    source: _pageBlocksOriginExt.source,
    createdAt: _pageBlocksOriginExt.createdAt,
  },
  orderBy: { col: _pageBlocksOriginExt.createdAt, dir: "desc" },
  window: { maxLimit: 500 },
});
