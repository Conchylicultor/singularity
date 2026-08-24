import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { blockContentResource } from "../../core";
import { loadBlockDoc } from "./doc-store";

// Server half of the per-block content resource. Keyed via the shared client
// descriptor (two-arg form) with `identityTable: "page_block_docs"`: the table's
// PK IS the resource's row key, so the change-feed knows a `doc-update` commit
// belongs to this resource and to which blockId it belongs.
//
// That is ALL it does. There is no `membership` here, so the runtime schedules a
// recompute for EVERY subscribed `{ blockId }` tuple on every write to the
// table: each one re-runs its own `where block_id = ?`, finds the changed row is
// not theirs, and diffs to empty. Those tuples receive no frame — an empty diff
// sends no value — but they DID each pay for a read, and typing flushes a
// `doc-update` roughly every 300 ms. So one person typing costs one read per
// open editor per flush. Do not read the missing frame as "no work happened".
//
// This fan-out is a known open problem with its own task. The obvious cure —
// declaring point membership over the blockId — was tried on this branch and
// caused a reproducible cross-context delivery regression, so it was reverted;
// the scoping is being redesigned from scratch rather than re-applied.
//
// Hand-written rather than `queryResource`: the wire `state` is base64 of a
// bytea, and encoding in SQL (`encode(…, 'base64')`) folds lines at 76 chars
// (RFC 2045), which would silently corrupt large states. Keeping the encoding
// in ONE JS helper (`stateToBase64`, shared with the doc-init response) makes
// the two wire representations identical by construction. The loader ignores
// `ctx.affectedIds` deliberately: the view is already scoped to a single row by
// `params.blockId`, so scoped and full recomputes are the same query.
export const blockContentServerResource = defineResource(blockContentResource, {
  loader: ({ blockId }) => loadBlockDoc(db, blockId),
  identityTable: "page_block_docs",
});
