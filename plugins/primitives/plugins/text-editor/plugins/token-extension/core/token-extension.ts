import type { LexicalNode } from "lexical";
import type { InlineTokenNodeRef } from "./inline-token-types";

/**
 * One inline token family, as a Lexical host's registries see it: an id, the
 * PATTERN that finds the token in a line, and the NODE it materializes as.
 *
 * The (de)serialization pair is DERIVED from the node descriptor, never written
 * by the contributor — which is what makes "a `serializeNode` that disagrees
 * with its `createNodeFromMatch`" unspellable. Both go through the node's own
 * `token` / `createFromMatch`, so a token written out is by construction a token
 * the same extension reads back.
 *
 * Pattern and node are SEPARATE because they are genuinely many-to-one: one
 * node class can be fed by a union of patterns (active-data's inline chips), and
 * a server contribution may carry the pattern alone (a protected span with no
 * decorator to build).
 *
 * NOT generic in the family's field record, deliberately: a host holds these in
 * one homogeneous list, and the field-erased {@link InlineTokenNodeRef} is
 * exactly the half of a node descriptor that survives being put in one (see
 * `inline-token-node.ts`'s module header). A consumer that needs the typed half
 * holds the family's own `InlineTokenNode<F>` directly.
 */
export interface InlineTokenExtension {
  /** Stable id (a React key where the host renders a companion plugin). */
  readonly id: string;
  /** Non-global pattern matching one token within a single line. */
  readonly pattern: RegExp;
  /** The node this extension's tokens materialize as. */
  readonly node: InlineTokenNodeRef;
  /** Build the node for a regex match; `null` when the match is not a token. */
  createNodeFromMatch(match: RegExpExecArray): LexicalNode | null;
  /** The token text for one of this family's nodes; `null` when not one. */
  serializeNode(node: LexicalNode): string | null;
}

/** THE way to build an {@link InlineTokenExtension}. */
export function tokenExtension(spec: {
  id: string;
  pattern: RegExp;
  node: InlineTokenNodeRef;
}): InlineTokenExtension {
  const { id, pattern, node } = spec;
  return {
    id,
    pattern,
    node,
    createNodeFromMatch(match: RegExpExecArray): LexicalNode | null {
      return node.createFromMatch(match);
    },
    serializeNode(candidate: LexicalNode): string | null {
      return node.token(candidate);
    },
  };
}
