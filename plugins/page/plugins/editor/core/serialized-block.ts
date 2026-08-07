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
  /**
   * The row this node ADDRESSES — never its own identity.
   *
   * Set only by the markdown parse, and only for a tag declaring
   * `markdown.tag.identified` (`<agent-note id="…">`): it is an id the AUTHOR
   * of the document wrote down, i.e. a *claim* about which existing row this
   * node corresponds to. Only a RECONCILING apply may honour it, and only after
   * proving the row exists and is in scope; every other consumer ignores it. A
   * node with no `ref` is a node the document asked to CREATE.
   *
   * It is deliberately not called `id`, and that is a safety property rather
   * than taste. {@link withMintedIds} is the sole id-minting site and is SHARED
   * WITH CLIPBOARD PASTE, where it spreads `...node`: under the name `id` a
   * pasted copy of a card would silently carry — and therefore reuse — a LIVE
   * row's identity. Under `ref` the spread carries it through inert and the
   * mint stays unconditional.
   */
  ref?: string;
}

export const SerializedBlockSchema: z.ZodType<SerializedBlock> = z.lazy(() =>
  z.object({
    type: z.string(),
    data: z.unknown(),
    expanded: z.boolean(),
    children: z.array(SerializedBlockSchema),
    ref: z.string().optional(),
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
  /**
   * The row this node ADDRESSES, carried through the mint untouched — see
   * {@link SerializedBlock.ref}. `id` and `ref` are two different questions
   * about the same node: `id` is the row this node WILL BE, `ref` is the row it
   * claims to correspond to, and only a reconciling apply is allowed to notice
   * that they disagree.
   */
  ref?: string;
}

export const IdentifiedBlockSchema: z.ZodType<IdentifiedBlock> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: z.string(),
    data: z.unknown(),
    expanded: z.boolean(),
    children: z.array(IdentifiedBlockSchema),
    ref: z.string().optional(),
  }),
);

/**
 * Stamp a fresh id onto every node of an id-less forest. The one minting site:
 * a caller that holds `IdentifiedBlock`s got them from here, and everything
 * downstream (reducer, overlay effect, server insert) merely carries them.
 *
 * **The mint is unconditional, and a node's `ref` never enters it.** The spread
 * carries `ref` through as inert cargo for whoever asked for the mint; honouring
 * it here would reach clipboard paste too, where the node's ref is a copy of a
 * LIVE row's id — so pasting a copied card would duplicate that row's identity
 * instead of creating a new card. Resolving a ref against real rows belongs to
 * the one caller that can check it (the markdown-apply planner), never here.
 */
export function withMintedIds(forest: SerializedBlock[]): IdentifiedBlock[] {
  return forest.map((node) => ({
    ...node,
    id: crypto.randomUUID(),
    children: withMintedIds(node.children),
  }));
}
