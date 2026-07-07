import { z } from "zod";
import { keyedResourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

// One block's persisted content-CRDT state, base64-encoded for the JSON
// live-state transport (raw bytes are not representable on the wire; the
// client decodes back to a Uint8Array and `Y.applyUpdate`s it — idempotent and
// commutative, so re-applying an echo of its own write is a no-op).
export const BlockDocRowSchema = z.object({
  blockId: z.string(),
  /** `Y.encodeStateAsUpdate(doc)` of the block's content doc, base64. */
  state: z.string(),
  updatedAt: z.coerce.date(),
});
export type BlockDocRow = z.infer<typeof BlockDocRowSchema>;

// Per-block content live resource, parameterized by `{ blockId }` so a client
// subscribes to exactly ONE block at a time — only mounted block editors
// subscribe, which is the lazy content-loading win. The payload is a keyed
// 0-or-1-element array (0 = doc not initialized yet; the first `doc-init`
// creates it). Keyed so a content change ships as a single-row delta through
// the standard keyed pipeline; the server half declares
// `identityTable: "page_block_docs"` so a write to one block's row
// scope-recomputes only that block's subscribers.
export const blockContentResource = keyedResourceDescriptor<
  BlockDocRow[],
  { blockId: string }
>(
  "page-block-doc",
  z.array(BlockDocRowSchema),
  [],
  (row) => (row as BlockDocRow).blockId,
);
