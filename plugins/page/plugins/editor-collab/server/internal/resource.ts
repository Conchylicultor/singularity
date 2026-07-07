import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { blockContentResource } from "../../core";
import { loadBlockDoc } from "./doc-store";

// Server half of the per-block content resource. Keyed via the shared client
// descriptor (two-arg form) with `identityTable: "page_block_docs"`: the table's
// PK IS the resource's row key, so the change-feed delivers a `doc-update`
// commit scoped to the one changed blockId and only that block's subscribers
// recompute — subscribers of other blocks get an empty scoped refill (their
// `where blockId = ?` excludes the changed id) and no push.
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
