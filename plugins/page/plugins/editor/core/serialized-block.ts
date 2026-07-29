import { z } from "zod";

/**
 * A block detached from its document — type, payload, expanded flag, and nested
 * children — with NO ids, ranks, or document scope. This is the portable shape
 * used by copy/paste (clipboard) and duplicate: the server re-mints ids and
 * ranks on insert via `insertForest`, so a serialized forest can be pasted into
 * any document (including a different one) safely.
 */
export interface SerializedBlock {
  type: string;
  // Optional to match `z.unknown()`'s inference; treated as `{}` when absent.
  data?: unknown;
  expanded: boolean;
  children: SerializedBlock[];
}

export const SerializedBlockSchema: z.ZodType<SerializedBlock> = z.lazy(() =>
  z.object({
    type: z.string(),
    data: z.unknown(),
    expanded: z.boolean(),
    children: z.array(SerializedBlockSchema),
  }),
);

/**
 * A `SerializedBlock` whose row identity has ALREADY been minted, carried ON the
 * node rather than positionally beside it.
 *
 * This is what lets a paste ride the optimistic op pipeline. `split` and
 * `insert` agree between client and server because the client mints `newId` and
 * ships it, so both reducers compute byte-identical rows; a forest needs that
 * same guarantee for EVERY node it inserts, not just for a root. Keeping the id
 * on the node (rather than a parallel `ids` array consumed in traversal order)
 * makes the agreement structural: a reordered traversal on either side cannot
 * silently re-assign identities.
 */
export interface IdentifiedBlock {
  id: string;
  type: string;
  data?: unknown;
  expanded: boolean;
  children: IdentifiedBlock[];
}

export const IdentifiedBlockSchema: z.ZodType<IdentifiedBlock> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: z.string(),
    data: z.unknown(),
    expanded: z.boolean(),
    children: z.array(IdentifiedBlockSchema),
  }),
);

/**
 * Stamp a fresh id onto every node of an id-less forest. The one minting site:
 * a caller that holds `IdentifiedBlock`s got them from here, and everything
 * downstream (reducer, overlay effect, server insert) merely carries them.
 */
export function withMintedIds(forest: SerializedBlock[]): IdentifiedBlock[] {
  return forest.map((node) => ({
    ...node,
    id: crypto.randomUUID(),
    children: withMintedIds(node.children),
  }));
}
