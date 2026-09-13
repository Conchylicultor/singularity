import { windowQueryResource } from "@plugins/infra/plugins/query-resource/server";
import { agentPagesResource as agentPagesDescriptor } from "../../shared/resources";
import { pageBlocksOrigin } from "./tables";

// Compiled bounded window (desc createdAt, default 200 / max 500). Every column
// of the marker is immutable post-insert — a marker is written once by the
// create hook and deleted by the sweep, never updated — so the window's order
// column is UPDATE-stable by construction (the `WindowOrderKey` rule). Marking
// a page is a membership ENTRY and sweeping it a membership EXIT; both ship
// incremental deltas, never a whole-collection recompute. No `select`: the
// projection is the extension's wire columns, which carry `createdAt` (a
// `wireTimestamps` entry of the shape) — the compiler derives the order
// signature from the wire row and throws at module eval if an order column is
// unprojected.
export const agentPagesServerResource = windowQueryResource(
  agentPagesDescriptor,
  {
    from: pageBlocksOrigin,
    orderBy: { col: pageBlocksOrigin.table.createdAt, dir: "desc" },
    window: { maxLimit: 500 },
  },
);
