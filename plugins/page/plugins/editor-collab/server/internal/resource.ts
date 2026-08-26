import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { blockContentResource } from "../../core";
import { loadBlockDoc } from "./doc-store";

// Server half of the per-block content resource. Keyed via the shared client
// descriptor (two-arg form) with `identityTable: "page_block_docs"`: the table's
// PK IS the resource's row key, so the change-feed knows a `doc-update` commit
// belongs to this resource and to which blockId it belongs.
//
// `rowIdentity` says the second half of that: the params tuple names exactly one
// row of the table, and this is its key. So a `doc-update` on one block is
// scheduled for THAT block's tuple only — the other open editors are no longer
// woken to re-read their own row, find the changed row is not theirs, and diff
// to empty. Typing flushes roughly every 300 ms, so what that deletes is one
// read per other open editor per flush. It changes routing and nothing else:
// the owning tuple's frames are byte-identical to before.
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
  rowIdentity: ({ blockId }) => blockId,
});
